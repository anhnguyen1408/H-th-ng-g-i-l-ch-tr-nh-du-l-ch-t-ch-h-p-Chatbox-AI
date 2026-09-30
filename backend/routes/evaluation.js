import express from 'express';
import { protect } from '../middleware/auth.js';
import RecommendationLog from '../models/RecommendationLog.js';
import SelectionLog from '../models/SelectionLog.js';

const router = express.Router();

const clampInt = (v, def, min, max) => {
  const n = parseInt(v, 10);
  if (!Number.isFinite(n)) return def;
  return Math.min(Math.max(n, min), max);
};

router.get('/recommendations', protect, async (req, res) => {
  try {
    const k = clampInt(req.query.k, 5, 1, 50);
    const windowMinutes = clampInt(req.query.windowMinutes, 60, 1, 24 * 60);
    const maxSamples = clampInt(req.query.maxSamples, 200, 1, 5000);
    const debug = req.query.debug === '1' || req.query.debug === 'true';

    const scope = typeof req.query.scope === 'string' ? req.query.scope.trim().toLowerCase() : 'me';
    const selectionQuery = (scope === 'all' && req.user?.role === 'admin') ? {} : { userId: req.user._id };

    const selections = await SelectionLog.find(selectionQuery)
      .sort({ createdAt: -1 })
      .limit(maxSamples)
      .lean();

    const windowMs = windowMinutes * 60 * 1000;

    let used = 0;
    let skippedNoRec = 0;
    let skippedNoSelected = 0;

    let sumPrecision = 0;
    let sumRecall = 0;

    let totalHits = 0;
    let totalRecommended = 0;
    let totalRelevant = 0;

    const rows = [];

    for (const sel of selections) {
      const selectedIds = Array.isArray(sel.selectedLocationIds) ? sel.selectedLocationIds.map((x) => String(x)) : [];
      const selectedSet = new Set(selectedIds);
      if (selectedSet.size === 0) {
        skippedNoSelected += 1;
        continue;
      }

      let recLog = null;

      if (sel.recommendationLogId) {
        recLog = await RecommendationLog.findById(sel.recommendationLogId).lean();
      }

      if (!recLog) {
        const end = new Date(sel.createdAt);
        const start = new Date(end.getTime() - windowMs);

        recLog = await RecommendationLog.findOne({
          userId: sel.userId,
          createdAt: { $gte: start, $lte: end },
        })
          .sort({ createdAt: -1 })
          .lean();
      }

      if (!recLog) {
        skippedNoRec += 1;
        continue;
      }

      const recommendedIds = Array.isArray(recLog.recommendedLocationIds)
        ? recLog.recommendedLocationIds.map((x) => String(x)).slice(0, k)
        : [];

      const recSet = new Set(recommendedIds);

      let hits = 0;
      for (const id of recSet) {
        if (selectedSet.has(id)) hits += 1;
      }

      const precision = k > 0 ? hits / k : 0;
      const recall = selectedSet.size > 0 ? hits / selectedSet.size : 0;

      used += 1;
      sumPrecision += precision;
      sumRecall += recall;

      totalHits += hits;
      totalRecommended += k;
      totalRelevant += selectedSet.size;

      if (debug) {
        rows.push({
          selectionLogId: sel._id,
          recommendationLogId: recLog._id,
          createdAt: sel.createdAt,
          hits,
          precision,
          recall,
          k,
          relevantCount: selectedSet.size,
        });
      }
    }

    const avgPrecision = used > 0 ? sumPrecision / used : 0;
    const avgRecall = used > 0 ? sumRecall / used : 0;

    const f1AtK = (avgPrecision + avgRecall) > 0
      ? (2 * avgPrecision * avgRecall) / (avgPrecision + avgRecall)
      : 0;

    const microPrecision = totalRecommended > 0 ? totalHits / totalRecommended : 0;
    const microRecall = totalRelevant > 0 ? totalHits / totalRelevant : 0;

    const microF1AtK = (microPrecision + microRecall) > 0
      ? (2 * microPrecision * microRecall) / (microPrecision + microRecall)
      : 0;

    return res.json({
      success: true,
      params: {
        k,
        windowMinutes,
        maxSamples,
        scope: (scope === 'all' && req.user?.role === 'admin') ? 'all' : 'me',
      },
      stats: {
        selectionsFetched: selections.length,
        used,
        skippedNoRec,
        skippedNoSelected,
      },
      metrics: {
        precisionAtK: avgPrecision,
        recallAtK: avgRecall,
        f1AtK,
        micro: {
          precisionAtK: microPrecision,
          recallAtK: microRecall,
          f1AtK: microF1AtK,
        },
      },
      details: debug ? rows : undefined,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message || 'Failed to evaluate recommendations',
    });
  }
});

export default router;

import express from 'express';
import Location from '../models/Location.js';
import jwt from 'jsonwebtoken';
import RecommendationLog from '../models/RecommendationLog.js';

const router = express.Router();

const getUserIdFromRequest = (req) => {
  try {
    const auth = req.headers.authorization;
    if (!auth || typeof auth !== 'string' || !auth.startsWith('Bearer ')) return null;
    const token = auth.split(' ')[1];
    if (!token) return null;
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    return decoded?.id || null;
  } catch (e) {
    return null;
  }
};

const parseCsv = (value) => {
  if (!value || typeof value !== 'string') return [];
  return value
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
};

const normalizeStr = (s) => (typeof s === 'string' ? s.trim().toLowerCase() : '');

const mapInterestsToTypes = (interests) => {
  const set = new Set();
  for (const raw of interests) {
    const interest = normalizeStr(raw);
    if (!interest) continue;

    if (interest === 'dining') set.add('restaurant');
    else if (interest === 'resort') set.add('hotel');
    else if (interest === 'culture' || interest === 'check-in') set.add('attraction');
    else if (interest === 'adventure' || interest === 'shopping' || interest === 'nightlife') set.add('activity');
  }
  return Array.from(set);
};

const interestToType = (interest) => {
  const x = normalizeStr(interest);
  if (!x) return null;
  if (x === 'dining') return 'restaurant';
  if (x === 'resort') return 'hotel';
  if (x === 'culture' || x === 'check-in') return 'attraction';
  if (x === 'adventure' || x === 'shopping' || x === 'nightlife') return 'activity';
  return null;
};

const safeNumber = (x, fallback = 0) => (Number.isFinite(x) ? x : fallback);

const cosineSimilarity = ({ dot, normA, normB }) => {
  if (!Number.isFinite(dot) || !Number.isFinite(normA) || !Number.isFinite(normB)) return 0;
  if (normA <= 0 || normB <= 0) return 0;
  return dot / (normA * normB);
};

router.get('/locations', async (req, res) => {
  try {
    const pretty = req.query.pretty === '1' || req.query.pretty === 'true';

    const compact = req.query.compact === '1' || req.query.compact === 'true';

    const algo = typeof req.query.algo === 'string' ? req.query.algo.trim().toLowerCase() : 'cosine';
    if (algo !== 'cosine') {
      return res.status(400).json({
        success: false,
        message: 'Unsupported algo. Only "cosine" is supported.',
      });
    }

    const city = typeof req.query.city === 'string' ? req.query.city.trim() : '';
    const interests = parseCsv(req.query.interests);

    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 12, 1), 50);
    const candidateLimit = Math.min(Math.max(parseInt(req.query.candidateLimit, 10) || 200, 20), 1000);

    const debug = req.query.debug === '1' || req.query.debug === 'true';

    const query = {
      isActive: true,
      isPublic: true,
    };

    const cityFilterMode = city ? 'exact_collation' : 'none';

    if (city) {
      query.city = city;
    }

    if (req.query.type) {
      query.type = req.query.type;
    }

    const selectFields = compact
      ? 'name type city country address coordinates rating ratingCount usageCount tags images'
      : 'name type city country address coordinates rating ratingCount usageCount usedBy tags images communityImages isVerified';

    const findQuery = Location.find(query)
      .limit(candidateLimit)
      .select(selectFields);

    if (city) {
      findQuery.collation({ locale: 'vi', strength: 1 });
    }

    const candidates = await findQuery.lean();

    const candidatesCount = candidates.length;

    if (candidatesCount === 0) {
      const payload = {
        success: true,
        stats: {
          algo,
          city,
          cityFilterMode,
          interests,
          typesPreferred: mapInterestsToTypes(interests),
          weights: {
            wUsage: 1,
            wRating: 1,
            wType: 1,
            wTag: 1,
          },
          candidateLimit,
          candidatesCount: 0,
          limit,
        },
        recommendations: [],
      };

      const userId = getUserIdFromRequest(req);
      if (userId) {
        try {
          await RecommendationLog.create({
            userId,
            city,
            interests,
            algo,
            limit,
            recommendedLocationIds: [],
          });
        } catch (e) {
          // ignore logging errors
        }
      }

      if (pretty) {
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        return res.status(200).send(JSON.stringify(payload, null, 2));
      }

      return res.json(payload);
    }

    const typesPreferred = mapInterestsToTypes(interests);
    const interestsNorm = interests.map(normalizeStr).filter(Boolean);
    const interestSet = new Set(interestsNorm);
    const queryTerms = Array.from(interestSet);
    for (const interest of interestSet) {
      const t = interestToType(interest);
      if (t) queryTerms.push(`type:${t}`);
    }
    const queryTermSet = new Set(queryTerms);

    if (queryTermSet.size === 0) {
      const payload = {
        success: true,
        stats: {
          algo,
          city,
          cityFilterMode,
          interests,
          typesPreferred,
          weights: {
            wInterest: 1,
          },
          candidateLimit,
          candidatesCount,
          scoredCount: 0,
          limit,
        },
        recommendations: [],
      };

      const userId = getUserIdFromRequest(req);
      if (userId) {
        try {
          await RecommendationLog.create({
            userId,
            city,
            interests,
            algo,
            limit,
            recommendedLocationIds: [],
          });
        } catch (e) {
          // ignore logging errors
        }
      }

      if (pretty) {
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        return res.status(200).send(JSON.stringify(payload, null, 2));
      }

      return res.json(payload);
    }

    const docTermsById = new Map();
    const df = new Map();
    for (const p of candidates) {
      const terms = new Set();
      if (p?.type) terms.add(`type:${normalizeStr(p.type)}`);
      const tags = Array.isArray(p.tags) ? p.tags : [];
      for (const tag of tags) {
        const k = normalizeStr(tag);
        if (k) terms.add(k);
      }
      docTermsById.set(String(p._id), terms);
      for (const term of terms) {
        df.set(term, (df.get(term) || 0) + 1);
      }
    }

    const N = candidates.length;
    const idf = (term) => {
      const dft = df.get(term) || 0;
      if (dft <= 0) return 0;
      return Math.log(N / dft);
    };

    const queryWeights = new Map();
    for (const term of queryTermSet) {
      const w = idf(term);
      if (w > 0) {
        queryWeights.set(term, w);
      }
    }
    const queryNorm = Math.sqrt(
      Array.from(queryWeights.values()).reduce((acc, w) => acc + (w * w), 0)
    );

    const scored = [];

    for (const p of candidates) {
      const usageCount = safeNumber(p.usageCount, 0);
      const rating = safeNumber(p.rating, 0);
      const ratingCount = safeNumber(p.ratingCount, 0);

      const terms = docTermsById.get(String(p._id)) || new Set();
      let dot = 0;
      let docSumSquares = 0;

      for (const term of terms) {
        const wd = idf(term);
        docSumSquares += wd * wd;
        const wq = queryWeights.get(term);
        if (wq) {
          dot += wq * wd;
        }
      }
      const docNorm = Math.sqrt(docSumSquares);

      const score = cosineSimilarity({ dot, normA: queryNorm, normB: docNorm });

      const baseScore = score;
      const finalScore = score;

      const cosineDebug = {
        dot,
        queryNorm,
        docNorm,
        queryTerms: Array.from(queryTermSet),
        matchedTerms: Array.from(terms).filter((t) => queryWeights.has(t)),
        queryWeights: Object.fromEntries(queryWeights),
      };

      const primaryImage = Array.isArray(p.images) && p.images.length > 0
        ? p.images[0]
        : (compact
          ? null
          : (Array.isArray(p.communityImages)
            ? (p.communityImages.find((img) => img && img.isApproved === true)?.url || null)
            : null));

      const item = compact
        ? {
          _id: p._id,
          name: p.name,
          type: p.type,
          city: p.city,
          country: p.country,
          address: p.address,
          coordinates: p.coordinates,
          tags: Array.isArray(p.tags) ? p.tags : [],
          primaryImage,
          usageCount,
          rating,
          ratingCount,
          score,
          baseScore,
          finalScore,
        }
        : {
          ...p,
          primaryImage,
          usageCount,
          rating,
          ratingCount,
          score,
          baseScore,
          finalScore,
        };

      if (debug) {
        item.components = {
          algo,
          cosine: cosineDebug,
        };
      }

      scored.push(item);
    }

    scored.sort((a, b) => {
      if ((b.finalScore || 0) !== (a.finalScore || 0)) return (b.finalScore || 0) - (a.finalScore || 0);
      if ((b.baseScore || 0) !== (a.baseScore || 0)) return (b.baseScore || 0) - (a.baseScore || 0);
      if (b.score !== a.score) return b.score - a.score;
      if ((b.ratingCount || 0) !== (a.ratingCount || 0)) return (b.ratingCount || 0) - (a.ratingCount || 0);
      if ((b.rating || 0) !== (a.rating || 0)) return (b.rating || 0) - (a.rating || 0);
      return (b.usageCount || 0) - (a.usageCount || 0);
    });

    const finalList = scored.slice(0, limit);

    const recommendations = finalList.map((p, idx) => ({
      rank: idx + 1,
      ...p,
    }));

    const scores = recommendations.map((r) => r.score);
    const scoreMax = scores.length ? Math.max(...scores) : 0;
    const scoreMin = scores.length ? Math.min(...scores) : 0;
    const scoreAvg = scores.length ? (scores.reduce((a, b) => a + b, 0) / scores.length) : 0;

    const typeDistCandidates = candidates.reduce((acc, p) => {
      const t = p.type || 'unknown';
      acc[t] = (acc[t] || 0) + 1;
      return acc;
    }, {});

    const typeDistRecommended = recommendations.reduce((acc, p) => {
      const t = p.type || 'unknown';
      acc[t] = (acc[t] || 0) + 1;
      return acc;
    }, {});

    const payload = {
      success: true,
      stats: {
        algo,
        city,
        cityFilterMode,
        interests,
        typesPreferred,
        weights: {
          wInterest: 1,
        },
        candidateLimit,
        candidatesCount,
        scoredCount: scored.length,
        limit,
        score: {
          min: scoreMin,
          max: scoreMax,
          avg: scoreAvg,
        },
        distribution: {
          candidatesByType: typeDistCandidates,
          recommendedByType: typeDistRecommended,
        },
      },
      recommendations,
    };

    const userId = getUserIdFromRequest(req);
    if (userId) {
      try {
        await RecommendationLog.create({
          userId,
          city,
          interests,
          algo,
          limit,
          recommendedLocationIds: recommendations.map((r) => r._id).filter(Boolean),
        });
      } catch (e) {
        // ignore logging errors
      }
    }

    if (pretty) {
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      return res.status(200).send(JSON.stringify(payload, null, 2));
    }

    return res.json(payload);
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message || 'Failed to generate recommendations',
    });
  }
});

export default router;

import express from 'express';
import { searchPlaces } from '../services/nominatimService.js';
import { getPlacesByInterests } from '../services/osmPlacesService.js';

const router = express.Router();

/**
 * Tìm kiếm địa điểm bằng Nominatim (không cần authentication)
 * GET /api/places/search?q=hanoi&limit=10
 */
router.get('/search', async (req, res) => {
  try {
    const { q, limit } = req.query;

    if (!q || q.trim() === '') {
      return res.status(400).json({
        success: false,
        message: 'Query parameter "q" is required',
      });
    }

    const places = await searchPlaces(q, parseInt(limit, 10) || 10);

    res.json({
      success: true,
      count: places.length,
      places,
    });
  } catch (error) {
    console.error('Error searching places:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to search places',
    });
  }
});

/**
 * Lấy danh sách địa điểm từ OpenStreetMap (không cần authentication)
 * POST /api/places/osm
 * Body: { destination, interests, coordinates, limit }
 */
router.post('/osm', async (req, res) => {
  try {
    const { destination, interests, coordinates, limit } = req.body;

    if (!destination || !coordinates) {
      return res.status(400).json({
        success: false,
        message: 'destination and coordinates are required',
      });
    }

    if (!coordinates.lat || !coordinates.lng) {
      return res.status(400).json({
        success: false,
        message: 'coordinates must have lat and lng',
      });
    }

    console.log(`[OSM] Fetching places for ${destination}...`);

    const places = await getPlacesByInterests(
      destination,
      interests || [],
      limit || 200,
      coordinates
    );

    console.log(`[OSM] Found ${places.length} places`);

    res.json({
      success: true,
      count: places.length,
      places,
    });
  } catch (error) {
    console.error('Error fetching OSM places:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to fetch OSM places',
    });
  }
});

export default router;

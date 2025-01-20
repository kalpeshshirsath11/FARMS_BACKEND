const { getCoordinates } = require('../services/geocodingService');
const { getByRoadDistance } = require('../services/routingService');

// Controller to calculate by-road distance
async function calculateByRoadDistance(req, res) {
  const { location1, location2 } = req.body;

  if (!location1 || !location2) {
    return res.status(400).json({ error: 'Both locations are required' });
  }

  try {
    // Get coordinates for both locations
    const coord1 = await getCoordinates(location1);
    const coord2 = await getCoordinates(location2);

    // console.log("Coorddd1 : ", coord1);
    // console.log("Coorddd2 : ", coord2);

    // Get by-road distance
    const distance = await getByRoadDistance(coord1, coord2);

    res.json({
      location1,
      coord1,
      location2,
      coord2,
      distance: `${distance.toFixed(2)} km`,
    });
  } catch (error) {
    res.status(500).json({ error: 'Error calculating by-road distance', details: error.message });
  }
}

module.exports = {
  calculateByRoadDistance,
};

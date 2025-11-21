const { db } = require('./firebase-admin-config');

/**
 * Get radiation readings with filters
 * @param {Object} filters - Filtering options
 * @returns {Promise<Array>} Array of radiation readings
 */
async function getRadiationReadings(filters = {}) {
    try {
        let query = db.collection('radiation-readings');
        
        // Apply filters
        if (filters.block) {
            query = query.where('block', '==', filters.block);
        }
        if (filters.plant) {
            query = query.where('plant', '==', filters.plant);
        }
        if (filters.area) {
            query = query.where('area', '==', filters.area);
        }
        if (filters.startDate && filters.endDate) {
            query = query.where('date', '>=', filters.startDate)
                        .where('date', '<=', filters.endDate);
        }
        
        // Add sorting
        query = query.orderBy('date', 'desc');
        
        if (filters.limit) {
            query = query.limit(filters.limit);
        }

        const snapshot = await query.get();
        return snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
        }));
    } catch (error) {
        console.error('Error fetching radiation readings:', error);
        throw error;
    }
}

/**
 * Get aggregated statistics from radiation readings
 * @param {Object} filters - Filtering options
 * @returns {Promise<Object>} Aggregated statistics
 */
async function getRadiationStatistics(filters = {}) {
    try {
        const readings = await getRadiationReadings(filters);
        
        // Calculate statistics
        const stats = {
            totalReadings: readings.length,
            averageNearReading: 0,
            averageOneMeterReading: 0,
            maxNearReading: 0,
            maxOneMeterReading: 0,
            readingsByBlock: {},
            readingsByArea: {},
            readingsByPlant: {}
        };

        if (readings.length > 0) {
            const nearReadings = readings.map(r => parseFloat(r.nearReading));
            const oneMeterReadings = readings.map(r => parseFloat(r.oneMeterReading));

            stats.averageNearReading = nearReadings.reduce((a, b) => a + b, 0) / readings.length;
            stats.averageOneMeterReading = oneMeterReadings.reduce((a, b) => a + b, 0) / readings.length;
            stats.maxNearReading = Math.max(...nearReadings);
            stats.maxOneMeterReading = Math.max(...oneMeterReadings);

            // Group by categories
            readings.forEach(reading => {
                // By Block
                if (!stats.readingsByBlock[reading.block]) {
                    stats.readingsByBlock[reading.block] = 0;
                }
                stats.readingsByBlock[reading.block]++;

                // By Area
                if (!stats.readingsByArea[reading.area]) {
                    stats.readingsByArea[reading.area] = 0;
                }
                stats.readingsByArea[reading.area]++;

                // By Plant
                if (!stats.readingsByPlant[reading.plant]) {
                    stats.readingsByPlant[reading.plant] = 0;
                }
                stats.readingsByPlant[reading.plant]++;
            });
        }

        return stats;
    } catch (error) {
        console.error('Error calculating radiation statistics:', error);
        throw error;
    }
}

module.exports = {
    getRadiationReadings,
    getRadiationStatistics
};
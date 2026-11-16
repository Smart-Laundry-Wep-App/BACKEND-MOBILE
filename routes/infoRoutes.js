const express = require('express');
const router = express.Router();
const { getOperationalHours, getHelpCenter } = require('../controllers/infoController');

router.get('/operational-hours', getOperationalHours);
router.get('/help-center', getHelpCenter);

module.exports = router;

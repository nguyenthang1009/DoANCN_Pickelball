const { Router } = require('express');
const venues = require('../controllers/venue.controller');
const courts = require('../controllers/court.controller');
const items = require('../controllers/serviceItem.controller');
const users = require('../controllers/user.controller');
const { verifyToken, authorize, authorizeVenue } = require('../middlewares/auth.middleware');
const { loadVenue } = require('../middlewares/load.middleware');

const router = Router();
const managers = [verifyToken, authorize(['ADMIN', 'MANAGER'])];
const ownVenue = [loadVenue, authorizeVenue('venueId')];

// Công khai: khách xem cơ sở và sân con trước khi đặt
router.get('/', venues.list);
router.get('/:venueId', loadVenue, venues.get);
router.get('/:venueId/courts', loadVenue, courts.listByVenue);
router.get('/:venueId/availability', loadVenue, venues.availability); // ma trận lịch trống theo ngày

// Admin quản lý cụm sân
router.post('/', verifyToken, authorize(['ADMIN']), venues.create);
router.patch('/:venueId', verifyToken, authorize(['ADMIN']), loadVenue, venues.update);

// Manager (cơ sở của mình) và Admin quản lý sân con, dịch vụ
router.post('/:venueId/courts', ...managers, ...ownVenue, courts.create);
router.get('/:venueId/services', verifyToken, authorize(['ADMIN', 'MANAGER', 'STAFF']), ...ownVenue, items.list);
router.post('/:venueId/services', ...managers, ...ownVenue, items.create);
router.get('/:venueId/staff', ...managers, ...ownVenue, users.listVenueStaff);

module.exports = router;

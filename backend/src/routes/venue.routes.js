const { Router } = require('express');
const venues = require('../controllers/venue.controller');
const courts = require('../controllers/court.controller');
const items = require('../controllers/serviceItem.controller');
const users = require('../controllers/user.controller');
const bookings = require('../controllers/booking.controller');
const reports = require('../controllers/report.controller');
const { verifyToken, can, authorizeVenue } = require('../middlewares/auth.middleware');
const { loadVenue } = require('../middlewares/load.middleware');

const router = Router();
const ownVenue = [loadVenue, authorizeVenue('venueId')];
// Có quyền và thuộc đúng cơ sở (BR15)
const inVenue = (code) => [verifyToken, can(code), ...ownVenue];

// Công khai: khách xem cơ sở và sân con trước khi đặt
router.get('/', venues.list);
router.get('/:venueId', loadVenue, venues.get);
router.get('/:venueId/courts', loadVenue, courts.listByVenue);
router.get('/:venueId/availability', loadVenue, venues.availability); // ma trận lịch trống theo ngày

// Admin quản lý cụm sân
router.post('/', verifyToken, can('venue.manage'), venues.create);
router.patch('/:venueId', verifyToken, can('venue.manage'), loadVenue, venues.update);

// Manager (cơ sở của mình) và Admin quản lý sân con, dịch vụ
router.post('/:venueId/courts', ...inVenue('court.manage'), courts.create);
router.get('/:venueId/services', ...inVenue('service.view'), items.list);
router.post('/:venueId/services', ...inVenue('service.manage'), items.create);
router.get('/:venueId/staff', ...inVenue('staff.view'), users.listVenueStaff);
router.get('/:venueId/bookings', ...inVenue('booking.view_venue'), bookings.listByVenue);
router.post('/:venueId/service-orders', ...inVenue('pos.sell'), reports.sellServices);

module.exports = router;

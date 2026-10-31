const { Router } = require('express');
const users = require('../controllers/user.controller');
const { verifyToken, authorize, authorizeVenue } = require('../middlewares/auth.middleware');

const router = Router();

// Manager xem nhân sự cơ sở của mình, Admin xem mọi cơ sở
router.get('/:venueId/staff', verifyToken, authorize(['ADMIN', 'MANAGER']), authorizeVenue('venueId'), users.listVenueStaff);

module.exports = router;

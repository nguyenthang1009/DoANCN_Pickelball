const { Router } = require('express');

const router = Router();

router.get('/health', (req, res) => res.json({ status: 'ok' }));
router.use('/auth', require('./auth.routes'));
router.use('/admin', require('./admin.routes'));
router.use('/venues', require('./venue.routes'));
router.use('/courts', require('./court.routes'));
router.use('/services', require('./serviceItem.routes'));
router.use('/bookings', require('./booking.routes'));
router.use('/payments', require('./payment.routes'));
router.use('/checkin', require('./checkin.routes'));
router.use('/reports', require('./report.routes'));
const finance = require('./finance.routes');

router.use('/invoices', finance.invoices);
router.use('/finance', finance.reports);
router.use('/payroll', finance.salary);
router.use('/site', finance.content);
router.use('/lighting', require('./lighting.routes'));

module.exports = router;

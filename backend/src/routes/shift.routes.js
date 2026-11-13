const { Router } = require('express');
const shifts = require('../services/shift.service');
const { verifyToken, can } = require('../middlewares/auth.middleware');

const send = (fn) => async (req, res) => res.json(await fn(req));
const id = (req) => Number(req.params.id);

const router = Router();
router.use(verifyToken);

// Nhân viên tự vào ca, ra ca, xem lịch của mình
router.get('/me', can('attendance.self'), send((req) => shifts.myStatus(req.user)));
router.post('/me/clock-in', can('attendance.self'), send((req) => shifts.clockIn(req.user)));
// Ra ca luôn được phép khi đang có lượt mở, kể cả khi vai trò vừa bị gỡ quyền chấm công, để không kẹt ca tính công sai
router.post('/me/clock-out', can(), send((req) => shifts.clockOut(req.user)));

// Quản lý xếp ca, xem ai đang trong ca, sửa chấm công
router.get('/templates', can('shift.manage'), send(async (req) => ({ templates: await shifts.listTemplates(req.user, req.query.venueId) })));
router.post('/templates', can('shift.manage'), send((req) => shifts.saveTemplate(req.user, req.body || {})));
router.put('/templates/:id', can('shift.manage'), send((req) => shifts.saveTemplate(req.user, req.body || {}, id(req))));
router.get('/schedule', can('shift.manage'), send((req) => shifts.schedule(req.user, req.query)));
router.post('/schedule', can('shift.manage'), send((req) => shifts.assign(req.user, req.body || {})));
router.delete('/schedule/:id', can('shift.manage'), send((req) => shifts.unassign(req.user, id(req))));
router.get('/on-duty', can('shift.manage'), send(async (req) => ({ onDuty: await shifts.onDuty(req.user, req.query.venueId) })));
router.get('/attendance', can('shift.manage'), send(async (req) => ({ records: await shifts.listAttendance(req.user, req.query) })));
router.post('/attendance', can('shift.manage'), send((req) => shifts.addAttendance(req.user, req.body || {})));
router.patch('/attendance/:id', can('shift.manage'), send((req) => shifts.updateAttendance(req.user, id(req), req.body || {})));

// Ngày lễ: quản lý xem để xếp ca, chỉ Admin sửa
router.get('/holidays', can('shift.manage', 'legal.manage'), send(async (req) => ({ holidays: await shifts.listHolidays(req.query.year) })));
router.post('/holidays', can('legal.manage'), send((req) => shifts.addHoliday(req.user, req.body || {})));
router.delete('/holidays/:date', can('legal.manage'), send((req) => shifts.removeHoliday(req.user, req.params.date)));

module.exports = router;

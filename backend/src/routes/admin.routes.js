const express = require('express');
const users = require('../controllers/user.controller');
const roles = require('../controllers/role.controller');
const site = require('../services/site.service');
const activity = require('../services/activity.service');
const { verifyToken, can } = require('../middlewares/auth.middleware');

const router = express.Router();

// Quản trị tài khoản, vai trò: các quyền này chỉ vai trò Admin có (permissions.admin_only)
router.use(verifyToken);
router.get('/users', can('user.view'), users.listUsers);
router.post('/users', can('user.manage'), users.createInternalUser);
router.patch('/users/:id', can('user.manage'), users.setActive);
router.patch('/users/:id/role', can('user.manage'), roles.assign);
router.patch('/users/:id/profile', can('user.manage'), users.updateProfile);
router.post('/users/:id/reset-password', can('user.manage'), users.resetPassword);

// Nhật ký hoạt động và cảnh báo bất thường của nhân sự
router.get('/activity', can('audit.view'), async (req, res) => res.json(await activity.list(req.query)));
router.get('/activity/filters', can('audit.view'), async (req, res) => res.json(await activity.filters()));
router.get('/activity/alerts', can('audit.view'), async (req, res) => res.json(await activity.alerts(req.query)));
router.get('/venues', can('venue.view_all'), users.listAllVenues);
router.get('/roles', can('role.manage'), roles.catalog);
router.post('/roles', can('role.manage'), roles.create);
router.put('/roles/:id', can('role.manage'), roles.update);
router.delete('/roles/:id', can('role.manage'), roles.remove);

// Ảnh và thông tin website. File gửi thẳng trong body, định dạng thật kiểm tra trong service.
const imageBody = express.raw({ type: ['image/jpeg', 'image/png', 'image/webp'], limit: '6mb' });
router.put('/site/settings', can('site.manage'), async (req, res) => res.json({ settings: await site.saveSettings(req.body?.settings, req.user) }));
router.put('/site/media/:key', can('site.manage'), imageBody, async (req, res) => res.json(await site.replaceImage(req.params.key, req.body, req.user)));
router.patch('/site/media/:key', can('site.manage'), async (req, res) => res.json(await site.updateMeta(req.params.key, req.body || {}, req.user)));
router.delete('/site/media/:key', can('site.manage'), async (req, res) => { await site.resetImage(req.params.key, req.user); res.json({ reset: true }); });

module.exports = router;

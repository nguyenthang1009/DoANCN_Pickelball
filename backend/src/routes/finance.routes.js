const { Router } = require('express');
const finance = require('../controllers/finance.controller');
const payroll = require('../services/payroll.service');
const site = require('../services/site.service');
const { verifyToken, can } = require('../middlewares/auth.middleware');

const send = (fn) => async (req, res) => res.json(await fn(req));

const invoices = Router();
invoices.use(verifyToken);
invoices.get('/my', can('invoice.view_own'), finance.myInvoices);
invoices.get('/', can('invoice.view_venue'), finance.listInvoices);
invoices.get('/:no', can('invoice.view_own', 'invoice.view_venue'), finance.getInvoice);

const reports = Router();
reports.use(verifyToken);
reports.get('/overview', can('finance.view'), finance.overview);
reports.get('/trial-balance', can('finance.view'), finance.trialBalance);
reports.get('/vat', can('finance.view'), finance.vat);
reports.get('/reconciliation', can('finance.reconcile'), finance.reconciliation);
reports.get('/legal-parameters', can('legal.manage', 'payroll.manage'), finance.legalList);
reports.post('/legal-parameters', can('legal.manage'), finance.legalAdd);

const salary = Router();
salary.use(verifyToken);
salary.get('/my', can('payroll.view_own'), send(async (req) => ({ payslips: await payroll.myPayslips(req.user) })));
salary.get('/contracts', can('payroll.manage'), send(async (req) => ({ staff: await payroll.listContracts(req.user, req.query.venueId) })));
salary.put('/contracts/:userId', can('payroll.manage'), send((req) => payroll.saveContract(Number(req.params.userId), req.body || {}, req.user)));
salary.get('/periods', can('payroll.manage', 'payroll.approve'), send(async (req) => ({ periods: await payroll.listPeriods(req.user, req.query.venueId) })));
salary.post('/periods', can('payroll.manage'), send(async (req) => ({ period: await payroll.createPeriod(req.body || {}, req.user) })));
salary.get('/periods/:id', can('payroll.manage', 'payroll.approve'), send(async (req) => ({ period: await payroll.getPeriod(Number(req.params.id), req.user) })));
salary.patch('/periods/:id/payslips/:slipId', can('payroll.manage'), send(async (req) => ({ period: await payroll.updateSlip(Number(req.params.id), Number(req.params.slipId), req.body || {}, req.user) })));
salary.post('/periods/:id/approve', can('payroll.approve'), send(async (req) => ({ period: await payroll.approve(Number(req.params.id), req.user) })));
salary.post('/periods/:id/pay', can('payroll.approve'), send(async (req) => ({ period: await payroll.markPaid(Number(req.params.id), req.user) })));

const content = Router();
content.get('/content', send(() => site.content()));

module.exports = { invoices, reports, salary, content };

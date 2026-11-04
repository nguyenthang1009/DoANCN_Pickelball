const financeService = require('../services/finance.service');
const invoiceService = require('../services/invoice.service');
const legalService = require('../services/legal.service');

const send = (fn) => async (req, res) => res.json(await fn(req));

module.exports = {
  myInvoices: send(async (req) => ({ invoices: await invoiceService.listMine(req.user) })),
  listInvoices: send((req) => invoiceService.listForStaff(req.user, req.query)),
  getInvoice: send(async (req) => ({ invoice: await invoiceService.getForUser(req.params.no, req.user) })),
  overview: send((req) => financeService.overview(req.user, req.query)),
  trialBalance: send((req) => financeService.trialBalance(req.user, req.query)),
  vat: send((req) => financeService.vatSummary(req.user, req.query)),
  reconciliation: send(() => financeService.reconciliation()),
  legalList: send(() => legalService.list()),
  legalAdd: send((req) => legalService.addVersion(req.body || {}, req.user)),
};

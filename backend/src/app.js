const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const cookieParser = require('cookie-parser');
const { corsOrigins, trustProxy } = require('./config/env');
const routes = require('./routes');
const { UPLOAD_DIR } = require('./services/site.service');
const { apiLimiter, verifyOrigin } = require('./middlewares/security.middleware');
const { notFound, errorHandler } = require('./middlewares/error.middleware');

const app = express();

if (trustProxy) app.set('trust proxy', trustProxy);
app.use(helmet());
app.use(cors({ origin: corsOrigins, credentials: true }));
app.use(cookieParser());
app.use(express.json({ limit: '100kb' }));
app.use('/uploads/site', express.static(UPLOAD_DIR, { maxAge: '7d', index: false, setHeaders: (res) => res.set('Cross-Origin-Resource-Policy', 'cross-origin') }));
app.use('/uploads/services', express.static(require('./services/serviceItem.service').IMAGE_DIR, { maxAge: '7d', index: false, setHeaders: (res) => res.set('Cross-Origin-Resource-Policy', 'cross-origin') }));
app.use('/api', apiLimiter, verifyOrigin, routes);
app.use(notFound);
app.use(errorHandler);

module.exports = app;

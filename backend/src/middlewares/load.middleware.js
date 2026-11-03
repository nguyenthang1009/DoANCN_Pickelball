const HttpError = require('../utils/httpError');
const venueService = require('../services/venue.service');
const courtService = require('../services/court.service');
const serviceItemService = require('../services/serviceItem.service');

// Nạp đối tượng theo id trên URL vào req, trả 404 nếu không có
function loader(param, key, getOrThrow) {
  return async (req, res, next) => {
    const id = Number(req.params[param]);
    if (!Number.isInteger(id) || id <= 0) throw new HttpError(404, 'NOT_FOUND', `${param} không hợp lệ`);
    req[key] = await getOrThrow(id);
    next();
  };
}

module.exports = {
  loadVenue: loader('venueId', 'venue', venueService.getOrThrow),
  loadCourt: loader('courtId', 'court', courtService.getOrThrow),
  loadServiceItem: loader('serviceId', 'serviceItem', serviceItemService.getOrThrow),
};

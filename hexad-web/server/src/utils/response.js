// Standard API response format
const success = (res, data = null, message = 'Success', statusCode = 200) => {
    return res.status(statusCode).json({
        success: true,
        message,
        data
    });
};

const created = (res, data = null, message = 'Created successfully') => {
    return success(res, data, message, 201);
};

const error = (res, message = 'Error', statusCode = 400, errors = null) => {
    return res.status(statusCode).json({
        success: false,
        message,
        ...(errors && { errors })
    });
};

const notFound = (res, message = 'Resource not found') => {
    return error(res, message, 404);
};

const unauthorized = (res, message = 'Unauthorized') => {
    return error(res, message, 401);
};

const forbidden = (res, message = 'Access denied') => {
    return error(res, message, 403);
};

const serverError = (res, message = 'Internal server error') => {
    return error(res, message, 500);
};

// Pagination helper
const paginate = (page = 1, limit = 20) => {
    const p = Math.max(1, parseInt(page));
    const l = Math.min(100, Math.max(1, parseInt(limit)));
    return {
        limit: l,
        offset: (p - 1) * l,
        page: p
    };
};

// Format paginated response
const paginatedResponse = (res, data, total, page, limit, message = 'Success') => {
    return res.status(200).json({
        success: true,
        message,
        data,
        pagination: {
            total,
            page,
            limit,
            totalPages: Math.ceil(total / limit),
            hasMore: page * limit < total
        }
    });
};

module.exports = {
    success,
    created,
    error,
    notFound,
    unauthorized,
    forbidden,
    serverError,
    paginate,
    paginatedResponse
};

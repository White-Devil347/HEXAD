// Global error handler middleware
const errorHandler = (err, req, res, next) => {
    console.error('Error:', err);

    // Default error
    let status = err.status || 500;
    let message = err.message || 'Internal Server Error';

    // Firebase Auth / credential errors
    // firebase-admin errors commonly expose `errorInfo.code` (e.g., 'auth/id-token-expired')
    const authCode = err?.errorInfo?.code || err?.code;
    if (typeof authCode === 'string' && authCode.startsWith('auth/')) {
        status = 401;
        message = 'Unauthorized.';
    }

    // Validation errors
    if (err.name === 'ValidationError') {
        status = 400;
    }

    // Send response
    res.status(status).json({
        success: false,
        message,
        ...(process.env.NODE_ENV === 'development' && { 
            stack: err.stack,
            details: err.details 
        })
    });
};

// 404 handler
const notFoundHandler = (req, res) => {
    res.status(404).json({
        success: false,
        message: `Route ${req.method} ${req.originalUrl} not found`
    });
};

module.exports = { errorHandler, notFoundHandler };

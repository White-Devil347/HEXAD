const mongoose = require('mongoose');

const connectDB = async () => {
  try {
    // Get MongoDB URI from environment variables
    const mongoURI = process.env.MONGODB_URI || process.env.MONGO_URI;

    // Validate that MongoDB URI is provided
    if (!mongoURI) {
      throw new Error(
        'MONGODB_URI is not defined. Set MONGODB_URI environment variable with your MongoDB Atlas connection string.'
      );
    }

    // Validate that it's not a localhost connection in production
    const nodeEnv = process.env.NODE_ENV || 'development';
    if (nodeEnv === 'production' && mongoURI.includes('localhost')) {
      throw new Error(
        'Production environment detected with localhost MongoDB URI. Use MongoDB Atlas URI instead.'
      );
    }

    console.log(`📡 Connecting to MongoDB (${nodeEnv})...`);

    await mongoose.connect(mongoURI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
    });

    console.log('✓ MongoDB connected successfully');
    console.log(`✓ Database: hexad-simulator`);
    return mongoose;
  } catch (error) {
    console.error('✗ MongoDB connection failed:', error.message);
    console.error('');
    console.error('💡 Solution:');
    console.error('   1. Ensure MONGODB_URI environment variable is set');
    console.error('   2. Use MongoDB Atlas connection string');
    console.error('   3. Format: mongodb+srv://user:password@cluster.mongodb.net/hexad-simulator');
    console.error('');
    process.exit(1);
  }
};

module.exports = connectDB;

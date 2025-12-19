const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 4000;
const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/user_management';

app.use(cors({ origin: 'http://localhost:3000' }));
app.use(express.json());

// --- Mongoose models ---

const geoSchema = new mongoose.Schema(
  {
    lat: { type: String, required: true },
    lng: { type: String, required: true }
  },
  { _id: false }
);

const addressSchema = new mongoose.Schema(
  {
    street: { type: String, required: true },
    city: { type: String, required: true },
    zip: { type: String, required: true },
    geo: { type: geoSchema, required: true }
  },
  { _id: false }
);

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, trim: true },
    phone: { type: String, required: true, trim: true },
    company: { type: String, default: '', trim: true },
    address: { type: addressSchema, required: true }
  },
  { timestamps: true }
);

const User = mongoose.model('User', userSchema);

// Validation helper
function validateUserPayload(body, { isPartial = false } = {}) {
  const errors = [];

  const addError = (field, message) => {
    errors.push({ field, message });
  };

  const checkRequired = (field, value, label = field) => {
    if (!value || (typeof value === 'string' && !value.trim())) {
      addError(field, `${label} is required`);
    }
  };

  // For partial (PATCH-like) updates you could skip required, but here we do full PUT,
  // so required fields apply even in update. isPartial flag kept for flexibility.
  const requireField = (field, value, label) => {
    if (!isPartial) {
      checkRequired(field, value, label);
    }
  };

  const { name, email, phone, company, address } = body;

  requireField('name', name, 'Name');
  requireField('email', email, 'Email');
  requireField('phone', phone, 'Phone');

  if (email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      addError('email', 'Email must be a valid email address');
    }
  }

  if (!isPartial || address) {
    if (!address || typeof address !== 'object') {
      addError('address', 'Address is required and must be an object');
    } else {
      const { street, city, zip, geo } = address;

      requireField('address.street', street, 'Street');
      requireField('address.city', city, 'City');
      requireField('address.zip', zip, 'ZIP');

      if (!isPartial || geo) {
        if (!geo || typeof geo !== 'object') {
          addError('address.geo', 'Geo is required and must be an object');
        } else {
          const { lat, lng } = geo;

          if (lat !== undefined && lat !== null && lat !== '') {
            if (Number.isNaN(Number(lat))) {
              addError('address.geo.lat', 'Latitude must be a number');
            }
          } else if (!isPartial) {
            addError('address.geo.lat', 'Latitude is required');
          }

          if (lng !== undefined && lng !== null && lng !== '') {
            if (Number.isNaN(Number(lng))) {
              addError('address.geo.lng', 'Longitude must be a number');
            }
          } else if (!isPartial) {
            addError('address.geo.lng', 'Longitude is required');
          }
        }
      }
    }
  }

  return errors;
}

// Standardized error response helper
function sendError(res, status, message, details) {
  return res.status(status).json({
    error: {
      message,
      details: details || null
    }
  });
}

// Routes

// GET /api/users - Return all users
app.get('/api/users', async (req, res, next) => {
  try {
    const users = await User.find().sort({ createdAt: -1 });
    res.json({ data: users });
  } catch (err) {
    next(err);
  }
});

// GET /api/users/:id - Return a single user by ID
app.get('/api/users/:id', async (req, res, next) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) {
      return sendError(res, 404, 'User not found');
    }
    res.json({ data: user });
  } catch (err) {
    // Invalid ObjectId etc.
    if (err.name === 'CastError') {
      return sendError(res, 404, 'User not found');
    }
    next(err);
  }
});

// POST /api/users - Create new user
app.post('/api/users', async (req, res, next) => {
  try {
    const errors = validateUserPayload(req.body, { isPartial: false });
    if (errors.length > 0) {
      return sendError(res, 400, 'Validation failed', errors);
    }

    const { name, email, phone, company, address } = req.body;

    const user = new User({
      name: name.trim(),
      email: email.trim(),
      phone: phone.trim(),
      company: company ? company.trim() : '',
      address: {
        street: address.street.trim(),
        city: address.city.trim(),
        zip: address.zip.trim(),
        geo: {
          lat: String(address.geo.lat).trim(),
          lng: String(address.geo.lng).trim()
        }
      }
    });

    const saved = await user.save();
    res.status(201).json({ data: saved });
  } catch (err) {
    next(err);
  }
});

// PUT /api/users/:id - Update user
app.put('/api/users/:id', async (req, res, next) => {
  try {
    const existingUser = await User.findById(req.params.id);
    if (!existingUser) {
      return sendError(res, 404, 'User not found');
    }

    const errors = validateUserPayload(req.body, { isPartial: false });
    if (errors.length > 0) {
      return sendError(res, 400, 'Validation failed', errors);
    }

    const { name, email, phone, company, address } = req.body;

    existingUser.name = name.trim();
    existingUser.email = email.trim();
    existingUser.phone = phone.trim();
    existingUser.company = company ? company.trim() : '';
    existingUser.address = {
      street: address.street.trim(),
      city: address.city.trim(),
      zip: address.zip.trim(),
      geo: {
        lat: String(address.geo.lat).trim(),
        lng: String(address.geo.lng).trim()
      }
    };

    const updated = await existingUser.save();
    res.json({ data: updated });
  } catch (err) {
    if (err.name === 'CastError') {
      return sendError(res, 404, 'User not found');
    }
    next(err);
  }
});

// DELETE /api/users/:id - Delete user
app.delete('/api/users/:id', async (req, res, next) => {
  try {
    const existingUser = await User.findById(req.params.id);
    if (!existingUser) {
      return sendError(res, 404, 'User not found');
    }

    await User.deleteOne({ _id: existingUser._id });
    res.status(204).send();
  } catch (err) {
    if (err.name === 'CastError') {
      return sendError(res, 404, 'User not found');
    }
    next(err);
  }
});

// 404 handler for unknown API routes
app.use('/api', (req, res) => {
  sendError(res, 404, 'Route not found');
});

app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  sendError(res, 500, 'Internal server error');
});

mongoose
  .connect(MONGO_URI)
  .then(() => {
    console.log('Connected to MongoDB');
    app.listen(PORT, () => {
      console.log(`User Management API listening on http://localhost:${PORT}`);
    });
  })
  .catch((err) => {
    console.error('Failed to connect to MongoDB', err);
    process.exit(1);
  });

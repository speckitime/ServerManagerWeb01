#!/usr/bin/env node

const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const path = require('path');

require('dotenv').config({ path: path.join(__dirname, '../../.env') });

const db = require('../config/database');

async function createAdmin() {
  try {
    const username = process.argv[2] || 'admin';
    const email = process.argv[3] || 'admin@servermanager.local';
    const password = process.argv[4] || crypto.randomBytes(12).toString('base64url');

    const existing = await db('users').where('username', username).first();
    if (existing) {
      console.log(`User "${username}" already exists.`);
      process.exit(0);
    }

    const passwordHash = await bcrypt.hash(password, 12);

    await db('users').insert({
      username,
      email,
      password_hash: passwordHash,
      full_name: 'System Administrator',
      role: 'admin',
      is_active: true,
    });

    console.log('='.repeat(50));
    console.log('Admin user created successfully!');
    console.log(`Username: ${username}`);
    console.log(`Email:    ${email}`);
    console.log(`Password: ${password}`);
    console.log('='.repeat(50));
    console.log('Please save these credentials securely!');
  } catch (err) {
    console.error('Error creating admin:', err.message);
    process.exit(1);
  } finally {
    await db.destroy();
  }
}

createAdmin();

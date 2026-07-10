import jwt from 'jsonwebtoken';

const generateToken = (payload, secretKey, expiryTime) => {
  return jwt.sign(payload, secretKey, { algorithm: 'HS512', expiresIn: `${expiryTime}` });
};

export { generateToken };

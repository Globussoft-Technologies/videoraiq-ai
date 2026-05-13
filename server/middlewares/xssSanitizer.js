import xss from "xss";

const sanitizeInput = (req, res, next) => {
  const sanitize = (value) => {
    if (typeof value === "string") {
      return xss(value);
    }
    return value;
  };

  const sanitizeObject = (obj) => {
    for (const key in obj) {
      if (typeof obj[key] === "object" && obj[key] !== null) {
        sanitizeObject(obj[key]);
      } else {
        obj[key] = sanitize(obj[key]);
      }
    }
  };

  if (req.body) sanitizeObject(req.body);
  if (req.query) sanitizeObject(req.query);
  if (req.params) sanitizeObject(req.params);

  next();
};

export default sanitizeInput;

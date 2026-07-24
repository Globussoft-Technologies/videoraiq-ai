import xss from "xss";

// Fields that may legitimately contain <, >, or & (passwords, tokens): never
// sanitize these or we corrupt credentials at the trust boundary.
const SKIP_KEYS = new Set([
  "password",
  "confirmPassword",
  "secretAccessKey",
  "oldPassword",
  "newPassword",
  "login",
  "pass",
]);

// XSS-sanitize request input WITHOUT HTML-encoding plain text. js-xss strips
// tags/handlers but leaves a bare "&" alone, so a JSON value like "J&K" stays
// "J&K". (The previous sanitize-html middleware turned it into "J&amp;K",
// corrupting saved/returned values for a JSON API that needs no HTML escaping.)
const sanitizeInput = (req, _res, next) => {
  const sanitize = (value) => (typeof value === "string" ? xss(value) : value);

  const sanitizeObject = (obj) => {
    for (const key in obj) {
      if (SKIP_KEYS.has(key)) continue;
      const val = obj[key];
      if (val && typeof val === "object") {
        sanitizeObject(val);
      } else {
        obj[key] = sanitize(val);
      }
    }
  };

  if (req.body) sanitizeObject(req.body);
  if (req.query) sanitizeObject(req.query);
  if (req.params) sanitizeObject(req.params);

  next();
};

export default sanitizeInput;

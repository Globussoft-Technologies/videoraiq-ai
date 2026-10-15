// Shared interpretation for analytics, raw evidence and grouped stock logs.
// Invalid counts remain events but contribute no box throughput.
export const stockNormalizationStages = (timezone) => [
        {
          $set: {
            _direction: {
              $toLower: { $trim: { input: { $ifNull: ["$direction", { $ifNull: ["$stockMovement", "unknown"] }] } } },
            },
            _boxCount: {
              $convert: {
                input: { $ifNull: ["$boxCount", "$count"] },
                to: "double", onError: null, onNull: null,
              },
            },
            _boxType: {
              $let: {
                vars: { value: { $toLower: { $trim: { input: { $ifNull: ["$boxType", ""] } } } } },
                in: { $cond: [{ $eq: ["$$value", ""] }, "unknown", "$$value"] },
              },
            },
            _vehicle: {
              $let: {
                vars: { value: { $toUpper: { $trim: { input: { $ifNull: ["$vehicleNumber", ""] } } } } },
                in: { $cond: [{ $eq: ["$$value", ""] }, "UNKNOWN", "$$value"] },
              },
            },
            _date: {
              $dateToString: { date: "$timeOfIncident", format: "%Y-%m-%d", timezone },
            },
            _hour: {
              $hour: { date: "$timeOfIncident", timezone },
            },
          },
        },
        { $set: {
          _invalidCount: { $or: [{ $eq: ["$_boxCount", null] }, { $lt: ["$_boxCount", 0] }, { $ne: ["$_boxCount", { $trunc: "$_boxCount" }] }] },
          _vehicle: { $cond: [{ $regexMatch: { input: "$_vehicle", regex: "^(UNKNOWN[0-9]*|UNREADABLE.*|N/?A|NONE|NULL|-)$" } }, "UNKNOWN", "$_vehicle"] },
        } },
        { $set: { _boxCount: { $cond: ["$_invalidCount", 0, "$_boxCount"] } } },
        { $set: { _validColourSplit: { $and: [
          ...["brownCount", "whiteCount", "otherCount"].map((field) => ({ $and: [
            { $isNumber: `$${field}` },
            { $gte: [`$${field}`, 0] },
            { $eq: [`$${field}`, { $trunc: { $convert: { input: `$${field}`, to: "double", onError: null, onNull: null } } }] },
          ] })),
          { $eq: [{ $add: ["brownCount", "whiteCount", "otherCount"].map((field) => ({ $convert: { input: `$${field}`, to: "double", onError: null, onNull: null } })) }, "$_boxCount"] },
          { $eq: ["$_invalidCount", false] },
        ] } } },
];

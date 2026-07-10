import Joi from 'joi';

class ReportValidation {
    sendReport(body) {
        const schema = Joi.object({
            reportsTitle: Joi.string().required(),
            frequency: Joi.array().items(Joi.object({
                Daily: Joi.number().integer().allow(null).default(0),
                Weekly: Joi.number().integer().allow(null).default(0),
                Monthly: Joi.number().integer().allow(null).default(0),
                Time: Joi.string().allow(null),
                Date: Joi.object({
                    startDate: Joi.date().allow(null),
                    endDate: Joi.date().allow(null)
                }).allow(null)
            }).custom((value, helpers) => {
                const frequencies = [value.Daily, value.Weekly, value.Monthly];
                const nonZeroFrequencies = frequencies.filter(frequency => frequency > 0);
                const hasTime = value.Time != null && value.Time.trim() !== "";
                const hasDate = value.Date && (value.Date.startDate || value.Date.endDate);
    
                // Check if only one frequency type is selected
                if ((nonZeroFrequencies.length > 1) || 
                    (nonZeroFrequencies.length > 0 && (hasTime || hasDate)) ||
                    (hasTime && hasDate)) {
                    return helpers.error("any.invalid", { message: "Only one frequency type should be selected." });
                }
                // Ensure at least one frequency type is selected
                if (nonZeroFrequencies.length === 0 && !hasTime && !hasDate) {
                    return helpers.error("any.invalid", { message: "At least one frequency type must be selected." });
                }
    
                return value;
            })),
            Recipients: Joi.array().items(Joi.string()),
            Content: Joi.array().items(Joi.object({
                consolidatedReport: Joi.number(),
                task: Joi.number(),
                clients: Joi.number(),
                leaves: Joi.number(),
                tags: Joi.number(),
                role: Joi.number()
            })),
            ReportsType: Joi.array().items(Joi.object({
                pdf: Joi.number(),
                csv: Joi.number()
            })),
            filter: Joi.object({
                wholeOrganization: Joi.number(),
                specificEmployees: Joi.array().items(Joi.object({
                    id: Joi.string()
                }))
            }),
            sendTestMail: Joi.boolean()
        });
    
        const result = schema.validate(body);
        return result;
    }
    
    
    updateReport(body){
        const schema = Joi.object({
            reportsTitle: Joi.string().required(),
            frequency: Joi.array().items(Joi.object({
                Daily: Joi.number().integer().allow(null).default(0),
                Weekly: Joi.number().integer().allow(null).default(0),
                Monthly: Joi.number().integer().allow(null).default(0),
                Time: Joi.string().allow(null),
                Date: Joi.object({
                    startDate: Joi.date().allow(null),
                    endDate: Joi.date().allow(null)
                }).allow(null)
            }).custom((value, helpers) => {
                const frequencies = [value.Daily, value.Weekly, value.Monthly];
                const nonZeroFrequencies = frequencies.filter(frequency => frequency > 0);
                const hasTime = value.Time != null && value.Time.trim() !== "";
                const hasDate = value.Date && (value.Date.startDate || value.Date.endDate);
    
                // Check if only one frequency type is selected
                if ((nonZeroFrequencies.length > 1) || 
                    (nonZeroFrequencies.length > 0 && (hasTime || hasDate)) ||
                    (hasTime && hasDate)) {
                    return helpers.error("any.invalid", { message: "Only one frequency type should be selected." });
                }
                // Ensure at least one frequency type is selected
                if (nonZeroFrequencies.length === 0 && !hasTime && !hasDate) {
                    return helpers.error("any.invalid", { message: "At least one frequency type must be selected." });
                }
    
                return value;
            })),
            Recipients: Joi.array().items(Joi.string()),
            Content: Joi.array().items(Joi.object({
                consolidatedReport: Joi.number(),
                task: Joi.number(),
                clients: Joi.number(),
                leaves: Joi.number(),
                tags: Joi.number(),
                role: Joi.number()
            })),
            ReportsType: Joi.array().items(Joi.object({
                pdf: Joi.number(),
                csv: Joi.number()
            })),
            filter: Joi.object({
                wholeOrganization: Joi.number(),
                specificEmployees: Joi.array().items(Joi.object({
                    id: Joi.string()
                }))
            }),
            sendTestMail: Joi.boolean()
        });
    
        const result = schema.validate(body);
        return result;
    }
}

export default new ReportValidation();
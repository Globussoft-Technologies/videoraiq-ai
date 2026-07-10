class Response {
  userSuccessResp(message, projectDetails) {
    return {
      statusCode: 200,
      body: {
        status: "success",
        message: message,
        data: projectDetails,
      },
    };
  }

  userFailResp(msg, err) {
    return {
      statusCode: 400,
      body: {
        status: "failed",
        message: msg,
        error: err,
      },
    };
  }
  tokenFailResp(message, error) {
    return {
      statusCode: 400,
      body: {
        status: "failed",
        message: message,
        error: error,
      },
    };
  }
  validationFailResp(message, error) {
    return {
      statusCode: 400,
      body: {
        status: "failed",
        message: message,
        error: error,
      },
    };
  }
  errorResp(message, error) {
    return {
      statusCode: 500,
      body: {
        status: "failed",
        message: message,
        error: error,
      },
    };
  }
  notFoundResp(message, error) {
    return {
      statusCode: 404,
      body: {
        status: "failed",
        message: message,
        error: error,
      },
    };
  }
  FailResp(msg, err) {
    return {
      statusCode: 400,
      body: {
        status: "failed",
        message: msg,
        error: err,
      },
    };
  }
  SuccessResp(message, projectDetails) {
    return {
      statusCode: 200,
      body: {
        status: "success",
        message: message,
        data: projectDetails,
      },
    };
  }
  accessDeniedResp(message, error) {
    return {
      statusCode: 403,
      body: {
        status: "failed",
        message: message,
        error: error,
      },
    };
  }
  planExpiredResp(message, error) {
    return {
      statusCode: 812,
      body: {
        status: "failed",
        message: message,
        error: error,
      },
    };
  }
}

export default new Response();

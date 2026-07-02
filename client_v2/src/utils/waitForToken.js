import getAccessToken from './getAccessToken';

export const waitForToken = async (retries = 5, delay = 200) => {
  let attempt = 0;
  while (attempt < retries) {
    const token = getAccessToken();
    if (token) return token;

    await new Promise(res => setTimeout(res, delay * Math.pow(2, attempt)));
    attempt++;
  }

  throw new Error("Failed to get access token after multiple retries");
};

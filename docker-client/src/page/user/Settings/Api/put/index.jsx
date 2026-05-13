import { waitForToken } from "@/utils/waitForToken";
const apiUrl = import.meta.env.VITE_BACKEND;

export const updateRecipient = async (id, data) => {
  const token = await waitForToken();
  try {
    const response = await fetch(`${apiUrl}/api/v1/recipients/update?id=${id}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        'x-access-token': token,
      },
      body: JSON.stringify(data),
    });
    const result = await response.json();
    return result.body || result;
  } catch (error) {
    console.error("Error updating recipient:", error);
    return { status: "error", message: error.message };
  }
};

import getAccessToken from '@/utils/getAccessToken';
import axios from 'axios';
const HOST = import.meta.env.VITE_BACKEND;

export const updateLogsSound = async function (logsSound) {
    const token = getAccessToken();
    return axios.put(
        `${HOST}/api/v1/admin/update-logs-sound`,
        { logsSound: !!logsSound },
        {
            headers: {
                Accept: 'application/json',
                'Content-Type': 'application/json',
                'x-access-token': token,
            },
        }
    );
};

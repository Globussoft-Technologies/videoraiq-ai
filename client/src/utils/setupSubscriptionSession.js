import axios from 'axios';
import { logout } from '@/hooks/logout';

let redirecting = false;
function checkExpiry(data) {
  if (redirecting || (data?.body?.code !== 'SUBSCRIPTION_EXPIRED' && data?.statusCode !== 812)) return;
  redirecting = true;
  logout();
  window.location.replace('/admin-login');
}

axios.interceptors.response.use(response => {
  checkExpiry(response.data);
  return response;
}, error => {
  checkExpiry(error.response?.data);
  return Promise.reject(error);
});

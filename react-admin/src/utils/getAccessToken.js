import Cookies from 'js-cookie'

function getAccessToken() {
  return Cookies.get('access-token') || null
}

export default getAccessToken

import Cookies from 'js-cookie';
const url=import.meta.env.VITE_ENV
function getAccessToken() { 
  // const domain = window.location.hostname;
  
  // if (domain.includes("dev"))
  // {
  //   cookieName="dev-access-token"

  // }else if(domain.includes("app")){

  //  cookieName = "prod-access-token"

  // }else{

  //   cookieName="local-access-token"

  // }
  let cookieName;
 if(url=="dev")
  {
     cookieName="dev-access-token"
  }else if(url=="prod")
  {
    cookieName = "prod-access-token"           
  }else{
    cookieName = "access-token" 
    }
            
  return Cookies.get(cookieName) || null;
}

export default getAccessToken;

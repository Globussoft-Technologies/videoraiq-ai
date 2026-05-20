import React, { useEffect, useState } from "react";
import { Formik, Form, Field, ErrorMessage } from "formik";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import Cookies from "js-cookie";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Eye, EyeOff, Mail, Lock, ArrowRight, ExternalLink } from "lucide-react";
import { HiMiniCloud, HiMiniBolt, HiMiniVideoCamera, HiMiniCpuChip } from "react-icons/hi2";
import adminbg from "@/assets/adminbg2.webp";
import logo from "@/assets/logo2.svg";
import * as Yup from "yup";
import { adminLoginLocal } from "../Api/post";
import { useAuth } from "@/context/AuthContext";
import { deleteCookie } from "@/components/Auth/IsAuth";
const url=import.meta.env.VITE_ENV
const adminLoginSchema = Yup.object({
  login: Yup.string().required("Username or Email is required"),
  pass: Yup.string().required("Password is required"),
});

const AdminLoginForm = () => {
  const { setUser } = useAuth();

  const navigate = useNavigate();
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [savedCredentials, setSavedCredentials] = useState({
    login: "",
    pass: "",
  });

  useEffect(() => {
    const saved = Cookies.get("admin-remember-me");
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        setSavedCredentials(parsed);
        setRememberMe(true);
      } catch {
        console.error("Invalid saved credentials");
      }
    }
  }, []);

  return (
    <section className="w-full h-screen flex bg-gradient-to-br from-slate-50 via-blue-50/30 to-cyan-50/20 relative overflow-hidden">
      {/* Animated Background Particles */}


      {/* Right Side - Login */}
      <div className="w-full lg:w-[42%] h-full relative overflow-hidden">
        {/* Enhanced Background Shapes - Fixed Position relative to container */}
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-0 right-0 w-[700px] h-[700px] bg-gradient-to-br from-[#07486A]/8 via-cyan-400/8 to-transparent rounded-full blur-3xl animate-pulse -z-10"></div>
          <div className="absolute -bottom-20 -left-20 w-[500px] h-[500px] bg-gradient-to-tr from-blue-100/60 to-transparent rounded-full blur-3xl animate-pulse -z-10" style={{ animationDelay: '1s' }}></div>
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-gradient-radial from-cyan-400/5 to-transparent rounded-full blur-2xl -z-10"></div>
        </div>

        {/* Scrollable Content Area */}
        <div className="absolute inset-0 overflow-y-auto customscrollbar">
          <div className="min-h-full flex items-center justify-center px-8 py-12">
            <div className="w-full max-w-md relative z-10">
              {/* Floating Badge */}
              <div className="mb-8 flex justify-center">
                <div className="inline-flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-[#07486A]/10 to-cyan-400/10 backdrop-blur-sm rounded-full border border-[#07486A]/20 shadow-lg shadow-[#07486A]/5">
                  <div className="w-2 h-2 bg-gradient-to-r from-[#07486A] to-cyan-400 rounded-full animate-pulse"></div>
                  <span className="text-xs font-semibold text-[#07486A] uppercase tracking-wider">Secure Admin Access</span>
                </div>
              </div>

              {/* Header with Enhanced Styling */}
              <div className="mb-10 text-center space-y-3">
                <h2 className="text-4xl md:text-5xl font-bold bg-gradient-to-br from-slate-900 via-[#07486A] to-slate-800 bg-clip-text text-transparent">
                  Admin Portal
                </h2>
                <p className="text-slate-600 text-base font-medium">
                  Sign in to access your admin dashboard
                </p>
              </div>

              {/* Formik Form */}
              <Formik
                enableReinitialize
                initialValues={{
                  login: savedCredentials.login || "",
                  pass: savedCredentials.pass || "",
                }}
                validationSchema={adminLoginSchema}
                onSubmit={async (values, { setSubmitting }) => {
                  try {
                    const result = await adminLoginLocal(values);

                    if (!result?.ok) return navigate('/admin-login');
                    if (result?.expired)
                      return navigate('/admin-login')

                    const token = result?.token;
                    //  const domain = window.location.hostname;
                                              // let cookieName;
                                              await new Promise(resolve => {
                                              //   if (domain.includes("dev"))
                                              //   {
                                              //     cookieName="dev-access-token"
                                                  
                                              //   }else if(domain.includes("app")){
                                              //    cookieName = "prod-access-token"           
                                                
                                              //   }else{
                                              //     cookieName="local-access-token"
                                                  
                                              //   }
                                              // Cookies.set(cookieName, token, {
                                              //   expires: 1,
                                              //   secure: true,
                                              //   path: "/",
                                              //   domain: domain, 
                                              // });
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
                                                  Cookies.set(cookieName, token, {
                                                    expires: 1,
                                                    secure: true,
                                                    path: "/",              
                                                  });
                                               resolve();
                                            })
                    // const domain = `.${window.location.hostname.split('.').slice(-2).join('.')}`;
                    // await new Promise(resolve => {
                    //   Cookies.set('access-token', token, {
                    //     expires: 1,
                    //     path: '/',
                    //     secure: true,
                    //     domain: domain,
                    //   });
                    //   resolve();
                    // });

                    deleteCookie('amember_login');
                    deleteCookie('amember_pass');

                    setUser(result.user);

                    if (rememberMe) {
                      Cookies.set("admin-remember-me", JSON.stringify(values), { expires: 7 });
                    } else {
                      Cookies.remove("admin-remember-me");
                    }
                    toast.success("Login successful!");
                    navigate("/dashboard");
                  } catch (error) {
                    // console.log("Login failed:", error?.response?.data?.msg);
                    toast.error(error?.response?.data?.msg || "Failed to Login!");
                  } finally {
                    setSubmitting(false);
                  }
                }}
              >
                {({ isSubmitting }) => (
                  <Form className="space-y-6">
                    {/* Username / Email with Enhanced Styling */}
                    <div className="space-y-2.5 group">
                      <label
                        htmlFor="login"
                        className="block text-sm font-semibold text-slate-700 group-focus-within:text-[#07486A] transition-colors"
                      >
                        Username or Email
                      </label>
                      <div className="relative">
                        <div className="absolute inset-0 bg-gradient-to-r from-[#07486A]/5 to-cyan-400/5 rounded-xl opacity-0 group-focus-within:opacity-100 transition-opacity blur-xl"></div>
                        <Mail className="absolute left-4 top-1/2 transform -translate-y-1/2 h-5 w-5 text-slate-400 group-focus-within:text-[#07486A] transition-all duration-300 z-10" />
                        <Field
                          as={Input}
                          id="login"
                          name="login"
                          type="text"
                          placeholder="Enter your username or email"
                          className="pl-12 h-12 md:h-14 relative bg-white/80 backdrop-blur-sm border-2 border-slate-200 rounded-xl text-slate-900 placeholder:text-slate-400 focus:bg-white focus:border-[#07486A] focus:ring-4 focus:ring-[#07486A]/10 hover:border-slate-300 hover:shadow-md transition-all duration-300"
                        />
                      </div>
                      <ErrorMessage
                        name="login"
                        component="div"
                        className="text-xs text-red-600 font-medium ml-1"
                      />
                    </div>

                    {/* Password with Enhanced Styling */}
                    <div className="space-y-2.5 group">
                      <label
                        htmlFor="pass"
                        className="block text-sm font-semibold text-slate-700 group-focus-within:text-[#07486A] transition-colors"
                      >
                        Password
                      </label>
                      <div className="relative">
                        <div className="absolute inset-0 bg-gradient-to-r from-[#07486A]/5 to-cyan-400/5 rounded-xl opacity-0 group-focus-within:opacity-100 transition-opacity blur-xl"></div>
                        <Lock className="absolute left-4 top-1/2 transform -translate-y-1/2 h-5 w-5 text-slate-400 group-focus-within:text-[#07486A] transition-all duration-300 z-10" />
                        <Field
                          as={Input}
                          id="pass"
                          name="pass"
                          type={showPassword ? "text" : "password"}
                          placeholder="Enter your password"
                          className="pl-12 pr-12 h-12 md:h-14 relative bg-white/80 backdrop-blur-sm border-2 border-slate-200 rounded-xl text-slate-900 placeholder:text-slate-400 focus:bg-white focus:border-[#07486A] focus:ring-4 focus:ring-[#07486A]/10 hover:border-slate-300 hover:shadow-md transition-all duration-300"
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword(!showPassword)}
                          className="absolute cursor-pointer right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-[#07486A] transition-all duration-300 z-10 p-1 hover:bg-slate-100 rounded-lg"
                        >
                          {showPassword ? (
                            <Eye className="h-5 w-5" />
                          ) : (
                            <EyeOff className="h-5 w-5" />
                          )}
                        </button>
                      </div>
                      <ErrorMessage
                        name="pass"
                        component="div"
                        className="text-xs text-red-600 font-medium ml-1"
                      />
                    </div>

                    {/* Remember Me + Forgot Password */}
                    <div className="flex items-center justify-between pt-1">
                      <div className="flex items-center gap-2.5">
                        <Checkbox
                          id="remember"
                          checked={rememberMe}
                          onCheckedChange={setRememberMe}
                          className="border-[#777777] data-[state=checked]:bg-[#07486A] size-4 md:size-4 2xl:size-5 cursor-pointer data-[state=checked]:text-white"
                        />
                        <label
                          htmlFor="remember"
                          className="text-sm text-slate-600 font-medium cursor-pointer"
                        >
                          Remember me
                        </label>
                      </div>
                      {/* <button
                        type="button"
                        onClick={() => navigate("/forgot-password")}
                        className="text-sm cursor-pointer font-semibold text-[#07486A] hover:text-[#063d5a] transition-colors"
                      >
                        Forgot password?
                      </button> */}
                    </div>

                    {/* Submit */}
                    <Button
                      type="submit"
                      disabled={isSubmitting}
                      className="w-full h-11 cursor-pointer md:h-13 bg-gradient-to-r from-[#07486A] to-[#0a5a7f] hover:from-[#063d5a] hover:to-[#084868] text-white font-semibold rounded-xl shadow-lg shadow-[#07486A]/20 hover:shadow-xl hover:shadow-[#07486A]/30 transition-all duration-300 group relative overflow-hidden"
                    >
                      {isSubmitting ? (
                        <span className="flex items-center justify-center gap-2">
                          <div className="h-4 w-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                          Signing in...
                        </span>
                      ) : (
                        <span className="flex items-center justify-center gap-2">
                          Sign In
                          <ArrowRight className="h-4 w-4 group-hover:translate-x-1 transition-transform duration-300" />
                        </span>
                      )}
                    </Button>

                    {/* Link to User Login */}
                    <div className="text-center pt-4">
                      <a
                        href={`/user-login`}
                        className="inline-flex items-center gap-1.5 text-sm text-[#07486A] hover:text-[#063d5a] underline transition-colors"
                      >
                        Login as user
                        <ExternalLink className="h-3.5 w-3.5" />
                      </a>
                    </div>
                  </Form>
                )}
              </Formik>
            </div>
          </div>
        </div>
      </div>

      {/* Left Side - Hero Section */}
      <div
        className="hidden bg-black lg:flex lg:w-[58%] relative overflow-hidden bg-cover bg-no-repeat bg-right"
        style={{ backgroundImage: `url(${adminbg})`, }}
      >
        {/* Gradient Overlay */}
        <div className="absolute inset-0 bg-gradient-to-b from-slate-900/40 via-slate-800/20 to-slate-900/90"></div>

        {/* Animated Glows */}


        {/* Content */}
        <div className="relative z-10 flex flex-col justify-between text-white px-16 py-16 w-full">
          {/* Logo and Status */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <img src={logo} alt="VideoraIQ" className="h-10 w-auto opacity-95 filter brightness-110" />
              <div className="h-6 w-px bg-white/80"></div>
              <span className="text-sm font-medium text-white/70 tracking-wide">ADMIN CONSOLE</span>
            </div>

          </div>

          {/* Hero Text */}
          <div className="space-y-10 max-w-full">
            <div className="space-y-6">
              <div className="flex items-center gap-2 text-cyan-400 text-sm font-semibold uppercase tracking-wider mb-4">
                <div className="w-8 h-[2px] bg-gradient-to-r from-cyan-400 to-transparent"></div>
                Trusted Platform
              </div>
              <h1 className="text-4xl md:text-6xl font-light tracking-tight leading-[1.1]">
                <span className="font-semibold bg-gradient-to-r from-cyan-300 via-cyan-400 to-white bg-clip-text text-transparent">
                  AI Surveillance Admin
                </span>
              </h1>
            </div>

            {/* Feature Pills */}
            <div className="flex flex-wrap gap-3">
              {[
                { icon: HiMiniCpuChip, label: "AI Detection" },
                { icon: HiMiniCloud, label: "Cloud Storage" },
                { icon: HiMiniBolt, label: "Real-time Alerts" },
                { icon: HiMiniVideoCamera, label: "4K Streaming" },
              ].map((feature, index) => {
                const IconComponent = feature.icon;
                return (
                  <div
                    key={index}
                    className="flex items-center gap-2 px-3 py-1.5 md:px-4 md:py-2 bg-white/5 backdrop-blur-sm border border-white/10 rounded-full text-sm text-white/90 hover:bg-white/10 hover:border-white/20 transition-all cursor-default"
                  >
                    <IconComponent className="h-4 w-4" />
                    {feature.label}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Bottom Stats */}

        </div>

        {/* Subtle Grid Overlay */}
        <div
          className="absolute inset-0 opacity-[0.03]"
          style={{
            backgroundImage: `linear-gradient(rgba(255,255,255,0.5) 1px, transparent 1px),
                              linear-gradient(90deg, rgba(255,255,255,0.5) 1px, transparent 1px)`,
            backgroundSize: "80px 80px",
          }}
        ></div>
      </div>
    </section>
  );
};

export default AdminLoginForm;

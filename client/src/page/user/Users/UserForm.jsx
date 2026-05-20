import React, { useEffect, useState } from "react";
import { Formik, Form, Field, ErrorMessage } from "formik";
import { userLoginSchema } from "@/page/user/Users/Schema/UserLoginSchema";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { userLogin } from "./api/post/Index";
import Cookies from "js-cookie";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Eye, EyeOff, Mail, Lock, ArrowRight, ExternalLink } from "lucide-react";
import adminbg from "@/assets/adminbg.webp";
import logo from "@/assets/logo.svg";
const url=import.meta.env.VITE_ENV
const LoginForm = () => {
  const navigate = useNavigate();
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [savedCredentials, setSavedCredentials] = useState({
    usernameOrEmail: "",
    password: "",
  });

  useEffect(() => {
    const saved = Cookies.get("remember-me");
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
    <section className="w-full h-screen flex bg-gradient-to-br from-slate-50 via-white to-slate-50 overflow-hidden">
      {/* Left Side - Hero Section */}
      <div
        className="hidden lg:flex lg:w-[58%] relative overflow-hidden bg-cover bg-no-repeat bg-[left_-15rem_center]"
        style={{ backgroundImage: `url(${adminbg})` }}
      >
        {/* Gradient Overlay */}
        <div className="absolute inset-0 bg-gradient-to-br from-slate-950/95 via-slate-900/92 to-[#07486A]/90"></div>

        {/* Animated Glows */}
        <div className="absolute top-1/4 -right-20 w-[500px] h-[500px] bg-[#07486A]/30 rounded-full blur-[140px] animate-pulse"></div>
        <div
          className="absolute bottom-1/4 -left-20 w-[450px] h-[450px] bg-cyan-500/15 rounded-full blur-[120px] animate-pulse"
          style={{ animationDelay: "1s" }}
        ></div>

        {/* Content */}
        <div className="relative z-10 flex flex-col justify-between text-white px-16 py-16 w-full">
          {/* Logo and Status */}
          <div className="flex items-center justify-between">
            <img src={logo} alt="VideoraIQ" className="h-12 md:h-22 w-auto opacity-95" />
            <div className="flex items-center gap-2 px-4 py-2 bg-white/5 backdrop-blur-md rounded-full border border-white/10">
              <div className="w-2 h-2 bg-emerald-400 rounded-full animate-pulse"></div>
              <span className="text-xs font-medium text-white/90">
                System Online
              </span>
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
                Enterprise-Grade
                <br />
                <span className="font-semibold bg-gradient-to-r from-white via-cyan-100 to-white bg-clip-text text-transparent">
                  Surveillance Platform
                </span>
              </h1>
            </div>

            {/* Feature Pills */}
            <div className="flex flex-wrap gap-3">
              {[
                "AI Detection",
                "Cloud Storage",
                "Real-time Alerts",
                "4K Streaming",
              ].map((feature, index) => (
                <div
                  key={index}
                  className="px-3 py-1.5 md:px-4 md:py-2 bg-white/5 backdrop-blur-sm border border-white/10 rounded-full text-sm text-white/90 hover:bg-white/10 hover:border-white/20 transition-all cursor-default"
                >
                  {feature}
                </div>
              ))}
            </div>
          </div>

          {/* Bottom Stats */}
          <div className="grid grid-cols-3 gap-6 md:gap-10 pt-8 border-t border-white/10">
            {[
              { title: "99.9%", label: "Uptime SLA" },
              { title: "24/7", label: "Support" },
              { title: "AES-256", label: "Encryption" },
            ].map((stat, i) => (
              <div key={i} className="space-y-2">
                <div className="text-3xl md:text-4xl font-bold bg-gradient-to-br from-white to-cyan-100 bg-clip-text text-transparent">
                  {stat.title}
                </div>
                <div className="text-xs text-slate-400 uppercase tracking-wider font-medium">
                  {stat.label}
                </div>
              </div>
            ))}
          </div>
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

      {/* Right Side - Login */}
      <div className="w-full lg:w-[42%] h-full bg-white relative overflow-hidden">
        {/* Soft Background Shapes */}
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-0 right-0 w-[600px] h-[600px] bg-gradient-to-br from-[#07486A]/5 via-cyan-400/5 to-transparent rounded-full blur-3xl -z-10"></div>
          <div className="absolute -bottom-20 -left-20 w-[400px] h-[400px] bg-gradient-to-tr from-slate-100/50 to-transparent rounded-full blur-3xl -z-10"></div>
        </div>

        <div className="absolute inset-0 overflow-y-auto customscrollbar">
          <div className="min-h-full flex items-center justify-center px-8 py-12">
            <div className="w-full max-w-md relative">
          {/* Header */}
          <div className="mb-10 text-center">
           
            <h2 className="text-3xl md:text-4xl font-bold text-slate-900">
              Welcome Back
            </h2>
            <p className="text-slate-600 text-base">
              Sign in to access your user dashboard
            </p>
          </div>

          {/* Formik Form */}
          <Formik
            enableReinitialize
            initialValues={{
              usernameOrEmail: savedCredentials.usernameOrEmail || "",
              password: savedCredentials.password || "",
            }}
            validationSchema={userLoginSchema}
            onSubmit={async (values, { setSubmitting }) => {
              try {
                const response = await userLogin(values);
                if (response?.data.body.status === "success") {
                  const token = response?.data?.body?.data?.token;
                  // const domain = `.${window.location.hostname
                  //   .split(".")
                  //   .slice(-2)
                  //   .join(".")}`;
                  // const domain = window.location.hostname;
                  // let cookieName;
                  //  if (domain.includes("dev"))
                  //   {
                  //       cookieName="dev-access-token"
                  //   }else if(domain.includes("app")){
                  //       cookieName = "prod-access-token"           
                  //   }else
                  //   {
                  //      cookieName="local-access-token"
                  //   }
                  // Cookies.set(cookieName, token, {
                  //   expires: 1,
                  //   path: "/",
                  //   secure: true,
                  //   domain,
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

                  if (rememberMe) {
                    Cookies.set("remember-me", JSON.stringify(values));
                  } else {
                    Cookies.remove("remember-me");
                  }

                  toast.success(response?.data.body.message || "");
                  navigate("/dashboard");
                } else {
                  toast.error(response?.data.body.message || "Failed to Login!");
                }
              } catch (error) {
                console.log("Login failed:", error.response?.data || error.message);
                toast.error(
                  error?.response?.data?.body?.message || "Failed to Login!"
                );
              } finally {
                setSubmitting(false);
              }
            }}
          >
            {({ isSubmitting }) => (
              <Form className="space-y-6">
                {/* Username / Email */}
                <div className="space-y-2.5">
                  <label
                    htmlFor="usernameOrEmail"
                    className="block text-sm font-semibold text-slate-700"
                  >
                    Username or Email
                  </label>
                  <div className="relative group">
                    <Mail className="absolute left-4 top-1/2 transform -translate-y-1/2 h-5 w-5 text-slate-400 group-focus-within:text-[#07486A] transition-all duration-200" />
                    <Field
                      as={Input}
                      id="usernameOrEmail"
                      name="usernameOrEmail"
                      type="text"
                      placeholder="you@company.com"
                      className="pl-12 h-11 md:h-13 bg-slate-50/50 border-slate-200 rounded-xl text-slate-900 placeholder:text-slate-400 focus:bg-white focus:border-[#07486A] focus:ring-2 focus:ring-[#07486A]/20 hover:border-slate-300 transition-all duration-200"
                    />
                  </div>
                  <ErrorMessage
                    name="usernameOrEmail"
                    component="div"
                    className="text-xs text-red-600 font-medium ml-1"
                  />
                </div>

                {/* Password */}
                <div className="space-y-2.5">
                  <label
                    htmlFor="password"
                    className="block text-sm font-semibold text-slate-700"
                  >
                    Password
                  </label>
                  <div className="relative group">
                    <Lock className="absolute left-4 top-1/2 transform -translate-y-1/2 h-5 w-5 text-slate-400 group-focus-within:text-[#07486A] transition-all duration-200" />
                    <Field
                      as={Input}
                      id="password"
                      name="password"
                      type={showPassword ? "text" : "password"}
                      placeholder="Enter your password"
                      className="pl-12 pr-12 h-11 md:h-13 bg-slate-50/50 border-slate-200 rounded-xl text-slate-900 placeholder:text-slate-400 focus:bg-white focus:border-[#07486A] focus:ring-2 focus:ring-[#07486A]/20 hover:border-slate-300 transition-all duration-200"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute cursor-pointer right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 transition-all"
                    >
                      {showPassword ? (
                        <Eye className="h-5 w-5" />
                      ) : (
                        <EyeOff className="h-5 w-5" />
                      )}
                    </button>
                  </div>
                  <ErrorMessage
                    name="password"
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
                  <button
                    type="button"
                    onClick={() => navigate("/forgot-password")}
                    className="text-sm cursor-pointer font-semibold text-[#07486A] hover:text-[#063d5a] transition-colors"
                  >
                    Forgot password?
                  </button>
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

                {/* Link to Admin Login */}
                <div className="text-center pt-4">
                  <a
                    href={`/admin-login`}
                    className="inline-flex items-center gap-1.5 text-sm text-[#07486A] hover:text-[#063d5a] underline transition-colors"
                  >
                    Login as admin
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
    </section>
  );
};

export default LoginForm;

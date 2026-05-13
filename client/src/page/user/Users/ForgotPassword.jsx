import React, { useState } from "react";
import { Formik, Form, Field, ErrorMessage } from "formik";
import * as Yup from "yup";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Mail, ArrowRight, ArrowLeft, CheckCircle2 } from "lucide-react";
import adminbg from "@/assets/adminbg.webp";
import logo from "@/assets/logo.svg";
import { forgotPassword } from "./api/post/Index";

const forgotPasswordSchema = Yup.object({
  email: Yup.string()
    .email("Enter a valid email address")
    .required("Email is required"),
});

const ForgotPassword = () => {
  const navigate = useNavigate();
  const [emailSent, setEmailSent] = useState(false);

  return (
    <section className="w-full min-h-screen flex bg-gradient-to-br from-slate-50 via-white to-slate-50">
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

      {/* Right Side - Forgot Password Form */}
      <div className="w-full lg:w-[42%] flex items-center justify-center px-8 py-12 bg-white relative overflow-hidden">
        {/* Soft Background Shapes */}
        <div className="absolute top-0 right-0 w-[600px] h-[600px] bg-gradient-to-br from-[#07486A]/5 via-cyan-400/5 to-transparent rounded-full blur-3xl -z-10"></div>
        <div className="absolute -bottom-20 -left-20 w-[400px] h-[400px] bg-gradient-to-tr from-slate-100/50 to-transparent rounded-full blur-3xl -z-10"></div>

        <div className="w-full max-w-md relative">
          {/* Back Button */}
          <button
            onClick={() => navigate("/user-login")}
            className="inline-flex items-center gap-2 text-slate-600 hover:text-[#07486A] transition-colors mb-8 group"
          >
            <ArrowLeft className="h-4 w-4 group-hover:-translate-x-1 transition-transform duration-300" />
            <span className="text-sm font-medium">Back to login</span>
          </button>

          {!emailSent ? (
            <>
              {/* Header */}
              <div className="mb-10 text-center">
                <h2 className="text-3xl md:text-4xl font-bold text-slate-900">
                  Forgot Password?
                </h2>
                <p className="text-slate-600 text-base mt-2">
                  No worries, we'll send you reset instructions
                </p>
              </div>

              {/* Formik Form */}
              <Formik
                initialValues={{
                  email: "",
                }}
                validationSchema={forgotPasswordSchema}
                onSubmit={async (values, { setSubmitting }) => {
                  try {
                    // TODO: Replace with actual API call
                    const response = await forgotPassword(values);  
                    setEmailSent(true);
                    toast.success(response?.data?.body?.message || 'Password reset link generated successfully');
                  } catch (error) {
                    console.error("Forgot password failed:", error);
                    toast.error(
                      error?.response?.data?.body?.message || "Failed to send reset email"
                    );
                  } finally {
                    setSubmitting(false);
                  }
                }}
              >
                {({ isSubmitting }) => (
                  <Form className="space-y-6">
                    {/* Email */}
                    <div className="space-y-2.5">
                      <label
                        htmlFor="email"
                        className="block text-sm font-semibold text-slate-700"
                      >
                        Email Address
                      </label>
                      <div className="relative group">
                        <Mail className="absolute left-4 top-1/2 transform -translate-y-1/2 h-5 w-5 text-slate-400 group-focus-within:text-[#07486A] transition-all duration-200" />
                        <Field
                          as={Input}
                          id="email"
                          name="email"
                          type="email"
                          placeholder="you@company.com"
                          className="pl-12 h-11 md:h-13 bg-slate-50/50 border-slate-200 rounded-xl text-slate-900 placeholder:text-slate-400 focus:bg-white focus:border-[#07486A] focus:ring-2 focus:ring-[#07486A]/20 hover:border-slate-300 transition-all duration-200"
                        />
                      </div>
                      <ErrorMessage
                        name="email"
                        component="div"
                        className="text-xs text-red-600 font-medium ml-1"
                      />
                    </div>

                    {/* Submit */}
                    <Button
                      type="submit"
                      disabled={isSubmitting}
                      className="w-full h-11 md:h-13 bg-gradient-to-r from-[#07486A] to-[#0a5a7f] hover:from-[#063d5a] hover:to-[#084868] text-white font-semibold rounded-xl shadow-lg shadow-[#07486A]/20 hover:shadow-xl hover:shadow-[#07486A]/30 transition-all duration-300 group relative overflow-hidden"
                    >
                      {isSubmitting ? (
                        <span className="flex items-center justify-center gap-2">
                          <div className="h-4 w-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                          Sending...
                        </span>
                      ) : (
                        <span className="flex items-center justify-center gap-2">
                          Send Reset Instructions
                          <ArrowRight className="h-4 w-4 group-hover:translate-x-1 transition-transform duration-300" />
                        </span>
                      )}
                    </Button>
                  </Form>
                )}
              </Formik>
            </>
          ) : (
            <>
              {/* Success State */}
              <div className="text-center space-y-6">
                <div className="inline-flex items-center justify-center w-16 h-16 bg-emerald-100 rounded-full mb-4">
                  <CheckCircle2 className="h-8 w-8 text-emerald-600" />
                </div>
                
                <div className="space-y-2">
                  <h2 className="text-3xl md:text-4xl font-bold text-slate-900">
                    Check Your Email
                  </h2>
                  <p className="text-slate-600 text-base">
                    We've sent password reset instructions to your email address
                  </p>
                </div>

                <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 text-sm text-slate-600">
                  <p className="font-medium text-slate-700 mb-1">Didn't receive the email?</p>
                  <p>Check your spam folder or try resending the email</p>
                </div>

                <div className="space-y-3 pt-4">
                  <Button
                    onClick={() => setEmailSent(false)}
                    className="w-full h-11 md:h-13 bg-gradient-to-r from-[#07486A] to-[#0a5a7f] hover:from-[#063d5a] hover:to-[#084868] text-white font-semibold rounded-xl shadow-lg shadow-[#07486A]/20 hover:shadow-xl hover:shadow-[#07486A]/30 transition-all duration-300"
                  >
                    Resend Email
                  </Button>
                  
                  <Button
                    onClick={() => navigate("/user-login")}
                    variant="outline"
                    className="w-full h-11 md:h-13 border-slate-200 hover:bg-slate-50 text-slate-700 font-semibold rounded-xl transition-all duration-300"
                  >
                    Back to Login
                  </Button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </section>
  );
};

export default ForgotPassword;

import fs from "fs";

export function mustRunInsideContainer() {
  try {
    // 1. Detect /.dockerenv (exists only in containers)
    if (fs.existsSync("/.dockerenv")) {
      return true;
    }

    // 2. Detect cgroup docker / containerd / kubepods
    const cgroup = fs.readFileSync("/proc/1/cgroup", "utf8");
    if (
      cgroup.includes("docker") ||
      cgroup.includes("containerd") ||
      cgroup.includes("kubepods")
    ) {
      return true;
    }
  } catch (err) {
    // ignore errors
  }

  console.error("❌ This application is protected");
  process.exit(1);
}

import type { NextConfig } from "next";
import path from "path";

// 모듈 해석 루트: cwd가 상위 폴더(Desktop 등)이면 T3TO-main으로 보정, 아니면 cwd 사용
const cwd = process.cwd();
const projectRoot =
  cwd.endsWith("Desktop") || cwd.endsWith("Desktop\\") || cwd.endsWith("Desktop/")
    ? path.join(cwd, "T3TO-main")
    : cwd;

const nextConfig: NextConfig = {
  /* config options here */
  reactCompiler: true,
  turbopack: {
    root: projectRoot,
  },
};

export default nextConfig;

import type {Metadata} from "next";
import Guide from "@/components/onboarding/guide";
export const metadata:Metadata={title:"同频 · 开始认识你",description:"从已有资料开始，逐步整理画像、合作偏好与想法的十阶段交互原型。"};
export default function GuidePage(){return <Guide/>;}

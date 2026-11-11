import { MotionPreferenceProvider } from "@/components/motion-preference";
import Hero from "@/components/sections/hero";
import People from "@/components/sections/people";
import Profile from "@/components/sections/profile";
import Recommendations from "@/components/sections/recommendations";
import Community from "@/components/sections/community";
import Footer from "@/components/sections/footer";
import { Presentation } from "@/components/presentation";
export default function Home() { return <MotionPreferenceProvider><a href="#people" className="skip-link">跳到正文</a><Presentation><Hero /><People /><Profile /><Recommendations /><Community /><Footer /></Presentation></MotionPreferenceProvider>; }

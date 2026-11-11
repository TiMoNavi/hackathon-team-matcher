"use client";

import { motion } from "motion/react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

// shadcn/ui primitives that also accept motion props (variants, whileHover…).
export const MotionCard = motion.create(Card);
export const MotionButton = motion.create(Button);

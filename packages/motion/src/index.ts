export const PACKAGE_NAME = "@meltemi/diagrams-motion";

export {
  DASH_PATTERN,
  DASH_PERIOD,
  DEFAULT_DURATIONS,
  GLOW,
  HALO,
  motionDuration,
  motionOptions,
  phaseAt,
  planMotion,
  sceneGroups,
  themeDurations,
  type MotionEffect,
  type MotionPlan,
  type PlanOptions,
} from "./plan.js";
export { sceneAt } from "./frames.js";
export { animatedScene, MOTION_CLASS } from "./css.js";
export { pointAlong, trackLength } from "./geometry.js";
export {
  boundsOf,
  frameBox,
  storyFrame,
  storyTimeline,
  storyViewData,
  viewKey,
  type StoryBox,
  type StoryFrameOptions,
  type StoryTimeline,
  type StoryViewData,
  type StoryViews,
  type TimelineAction,
  type TimelineScene,
} from "./story.js";
export {
  DRILL_DURATIONS,
  drillFrame,
  drillTimeline,
  transitionFor,
  type DrillDirection,
  type DrillSpec,
  type DrillTransition,
} from "./drill.js";
export { parseTime } from "./time.js";

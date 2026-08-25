import { Redirect } from 'expo-router';

/**
 * Backward-compatible entry point for old links.
 * Farmer planning now has one implementation in the Garden screen.
 */
export default function PlanningRedirect() {
  return <Redirect href="/(tabs)/garden?tab=planning" />;
}

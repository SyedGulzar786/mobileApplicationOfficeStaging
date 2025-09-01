// MyMobileApp/utils/formatDuration.ts

/**
 * Format duration between two dates into human-friendly format.
 * Supports milliseconds → seconds → minutes → hours.
 */
export const formatDuration = (start: string, end?: string): string => {
  try {
    const startDate = new Date(start).getTime();
    const endDate = end ? new Date(end).getTime() : Date.now();

    if (isNaN(startDate) || isNaN(endDate)) return "--";

    let diffMs = endDate - startDate;
    if (diffMs < 0) diffMs = 0;

    const ms = diffMs % 1000;
    const totalSeconds = Math.floor(diffMs / 1000);
    const seconds = totalSeconds % 60;
    const totalMinutes = Math.floor(totalSeconds / 60);
    const minutes = totalMinutes % 60;
    const hours = Math.floor(totalMinutes / 60);

    if (hours > 0) {
      return `${hours}h ${minutes}m`;
    } else if (minutes > 0) {
      return `${minutes}m ${seconds}s`;
    } else if (seconds > 0) {
      return `${seconds}s ${ms}ms`;
    } else {
      return `${ms}ms`;
    }
  } catch (e) {
    return "--";
  }
};

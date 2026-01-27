// Simple cron expression parser
// Supports: minute hour day-of-month month day-of-week
// Examples: "0 0 * * *" (daily at midnight), "*/5 * * * *" (every 5 minutes)

export function parseCronExpression(expression) {
  const parts = expression.trim().split(/\s+/);
  if (parts.length !== 5) {
    throw new Error('Invalid cron expression: must have 5 parts (minute hour day month weekday)');
  }

  const [minute, hour, dayOfMonth, month, dayOfWeek] = parts;

  return {
    minute: parseField(minute, 0, 59),
    hour: parseField(hour, 0, 23),
    dayOfMonth: parseField(dayOfMonth, 1, 31),
    month: parseField(month, 1, 12),
    dayOfWeek: parseField(dayOfWeek, 0, 6)
  };
}

function parseField(field, min, max) {
  if (field === '*') {
    return { type: 'any' };
  }

  if (field.startsWith('*/')) {
    const step = parseInt(field.slice(2), 10);
    if (isNaN(step) || step < 1) {
      throw new Error(`Invalid step value: ${field}`);
    }
    return { type: 'step', step, min, max };
  }

  if (field.includes('-')) {
    const [start, end] = field.split('-').map(n => parseInt(n, 10));
    if (isNaN(start) || isNaN(end) || start < min || end > max || start > end) {
      throw new Error(`Invalid range: ${field}`);
    }
    return { type: 'range', start, end };
  }

  if (field.includes(',')) {
    const values = field.split(',').map(n => parseInt(n, 10));
    if (values.some(v => isNaN(v) || v < min || v > max)) {
      throw new Error(`Invalid list: ${field}`);
    }
    return { type: 'list', values };
  }

  const value = parseInt(field, 10);
  if (isNaN(value) || value < min || value > max) {
    throw new Error(`Invalid value: ${field}`);
  }
  return { type: 'value', value };
}

function matchesField(parsed, value) {
  switch (parsed.type) {
    case 'any':
      return true;
    case 'value':
      return parsed.value === value;
    case 'step':
      return value % parsed.step === 0;
    case 'range':
      return value >= parsed.start && value <= parsed.end;
    case 'list':
      return parsed.values.includes(value);
    default:
      return false;
  }
}

export function matchesCron(expression, date = new Date()) {
  try {
    const parsed = parseCronExpression(expression);
    return (
      matchesField(parsed.minute, date.getMinutes()) &&
      matchesField(parsed.hour, date.getHours()) &&
      matchesField(parsed.dayOfMonth, date.getDate()) &&
      matchesField(parsed.month, date.getMonth() + 1) &&
      matchesField(parsed.dayOfWeek, date.getDay())
    );
  } catch (err) {
    console.error(`Invalid cron expression "${expression}":`, err.message);
    return false;
  }
}

export function getNextRun(expression, fromDate = new Date()) {
  try {
    parseCronExpression(expression); // Validate
    const date = new Date(fromDate);
    date.setSeconds(0);
    date.setMilliseconds(0);
    date.setMinutes(date.getMinutes() + 1);

    const maxIterations = 525600;
    for (let i = 0; i < maxIterations; i++) {
      if (matchesCron(expression, date)) {
        return date;
      }
      date.setMinutes(date.getMinutes() + 1);
    }
    return null;
  } catch (err) {
    console.error(`Error calculating next run for "${expression}":`, err.message);
    return null;
  }
}

export function describeCron(expression) {
  try {
    const parts = expression.trim().split(/\s+/);
    if (parts.length !== 5) return expression;

    const [minute, hour, dayOfMonth, month, dayOfWeek] = parts;

    if (minute === '0' && hour === '0' && dayOfMonth === '*' && month === '*' && dayOfWeek === '*') {
      return 'Daily at midnight';
    }
    if (minute === '0' && hour === '*' && dayOfMonth === '*' && month === '*' && dayOfWeek === '*') {
      return 'Every hour';
    }
    if (minute.startsWith('*/') && hour === '*' && dayOfMonth === '*' && month === '*' && dayOfWeek === '*') {
      return `Every ${minute.slice(2)} minutes`;
    }
    if (minute === '0' && hour === '0' && dayOfMonth === '*' && month === '*' && dayOfWeek === '0') {
      return 'Weekly on Sunday';
    }
    if (minute === '0' && hour === '0' && dayOfMonth === '1' && month === '*' && dayOfWeek === '*') {
      return 'Monthly on the 1st';
    }

    let desc = [];
    if (minute !== '*') desc.push(`minute ${minute}`);
    if (hour !== '*') desc.push(`hour ${hour}`);
    if (dayOfMonth !== '*') desc.push(`day ${dayOfMonth}`);
    if (month !== '*') desc.push(`month ${month}`);
    if (dayOfWeek !== '*') {
      const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
      const day = parseInt(dayOfWeek, 10);
      if (!isNaN(day) && day >= 0 && day <= 6) desc.push(days[day]);
    }

    return desc.length > 0 ? desc.join(', ') : 'Custom schedule';
  } catch {
    return expression;
  }
}

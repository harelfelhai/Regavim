import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import OfflineQueue from '../OfflineQueue';

const NOW = new Date().toISOString();

const pendingItem = {
  id: 'p1',
  status: 'pending',
  fields: { description: 'פרשייה ממתינה' },
  createdAt: NOW,
  error: null,
};

const failedItem = {
  id: 'f1',
  status: 'failed',
  fields: { description: 'פרשייה שנכשלה' },
  createdAt: NOW,
  error: 'שגיאת שרת',
};

const uploadingItem = {
  id: 'u1',
  status: 'uploading',
  fields: { description: 'פרשייה בשליחה' },
  createdAt: NOW,
  error: null,
};

function renderQueue(props = {}) {
  const defaults = {
    queue:     [],
    syncing:   false,
    isOnline:  true,
    onRetry:   vi.fn(),
    onDiscard: vi.fn(),
    onEdit:    vi.fn(),
  };
  return render(<OfflineQueue {...defaults} {...props} />);
}

beforeEach(() => vi.clearAllMocks());

// ── Visibility ────────────────────────────────────────────────────────────────

describe('OfflineQueue — visibility', () => {
  it('renders nothing when queue is empty and online', () => {
    const { container } = renderQueue({ queue: [], isOnline: true });
    expect(container).toBeEmptyDOMElement();
  });

  it('renders when queue is empty but offline', () => {
    renderQueue({ queue: [], isOnline: false });
    expect(screen.getByTestId('offline-queue')).toBeInTheDocument();
  });

  it('renders when items are queued (online)', () => {
    renderQueue({ queue: [pendingItem], isOnline: true });
    expect(screen.getByTestId('offline-queue')).toBeInTheDocument();
  });
});

// ── Header status text ────────────────────────────────────────────────────────

describe('OfflineQueue — header status text', () => {
  it('shows syncing indicator when syncing=true', () => {
    renderQueue({ queue: [pendingItem], syncing: true });
    expect(screen.getByText('מסנכרן...')).toBeInTheDocument();
  });

  it('shows failed-count text when there are failed items (and not syncing)', () => {
    renderQueue({ queue: [failedItem], syncing: false });
    expect(screen.getByText(/נכשל/)).toBeInTheDocument();
  });

  it('shows pending-count text when items are pending (no failures)', () => {
    renderQueue({ queue: [pendingItem], syncing: false });
    expect(screen.getByText(/ממתין/)).toBeInTheDocument();
  });

  it('shows offline message when offline and queue is empty', () => {
    renderQueue({ queue: [], isOnline: false });
    expect(screen.getByText('לא מחובר לרשת')).toBeInTheDocument();
  });

  it('failed text takes priority over pending when both exist', () => {
    renderQueue({ queue: [pendingItem, failedItem], syncing: false });
    expect(screen.getByText(/נכשל/)).toBeInTheDocument();
    expect(screen.queryByText(/ממתין/)).not.toBeInTheDocument();
  });
});

// ── Item list (expanded) ──────────────────────────────────────────────────────

describe('OfflineQueue — item list', () => {
  function expand() {
    fireEvent.click(screen.getByRole('button', { expanded: false }));
  }

  it('item descriptions are hidden before expanding', () => {
    renderQueue({ queue: [pendingItem] });
    expect(screen.queryByText(pendingItem.fields.description)).not.toBeInTheDocument();
  });

  it('shows item descriptions after expanding', () => {
    renderQueue({ queue: [pendingItem, failedItem] });
    expand();
    expect(screen.getByText(pendingItem.fields.description)).toBeInTheDocument();
    expect(screen.getByText(failedItem.fields.description)).toBeInTheDocument();
  });

  it('shows error message for failed items', () => {
    renderQueue({ queue: [failedItem] });
    expand();
    expect(screen.getByText(failedItem.error)).toBeInTheDocument();
  });

  it('shows "ללא תיאור" for items with empty description', () => {
    const noDesc = { ...pendingItem, fields: { description: '' } };
    renderQueue({ queue: [noDesc] });
    expand();
    expect(screen.getByText('ללא תיאור')).toBeInTheDocument();
  });

  it('shows "שולח..." badge for uploading items', () => {
    renderQueue({ queue: [uploadingItem] });
    expand();
    expect(screen.getByText('שולח...')).toBeInTheDocument();
  });

  it('shows "נכשל" badge for failed items', () => {
    renderQueue({ queue: [failedItem] });
    expand();
    expect(screen.getByText('נכשל')).toBeInTheDocument();
  });

  it('shows "ממתין" badge for pending items', () => {
    renderQueue({ queue: [pendingItem] });
    expand();
    expect(screen.getByText('ממתין')).toBeInTheDocument();
  });
});

// ── Item actions ──────────────────────────────────────────────────────────────

describe('OfflineQueue — item actions', () => {
  function expand() {
    fireEvent.click(screen.getByRole('button', { expanded: false }));
  }

  it('calls onDiscard with the item id when discard is clicked (pending)', () => {
    const onDiscard = vi.fn();
    renderQueue({ queue: [pendingItem], onDiscard });
    expand();
    fireEvent.click(screen.getByTestId(`discard-${pendingItem.id}`));
    expect(onDiscard).toHaveBeenCalledWith(pendingItem.id);
  });

  it('calls onDiscard with the item id when discard is clicked (failed)', () => {
    const onDiscard = vi.fn();
    renderQueue({ queue: [failedItem], onDiscard });
    expand();
    fireEvent.click(screen.getByTestId(`discard-${failedItem.id}`));
    expect(onDiscard).toHaveBeenCalledWith(failedItem.id);
  });

  it('calls onRetry with the item id when retry is clicked on a failed item', () => {
    const onRetry = vi.fn();
    renderQueue({ queue: [failedItem], onRetry });
    expand();
    fireEvent.click(screen.getByTestId(`retry-${failedItem.id}`));
    expect(onRetry).toHaveBeenCalledWith(failedItem.id);
  });

  it('calls onEdit with the full item when edit is clicked on a failed item', () => {
    const onEdit = vi.fn();
    renderQueue({ queue: [failedItem], onEdit });
    expand();
    fireEvent.click(screen.getByTestId(`edit-${failedItem.id}`));
    expect(onEdit).toHaveBeenCalledWith(failedItem);
  });

  it('does not show retry/edit buttons for pending items', () => {
    renderQueue({ queue: [pendingItem] });
    expand();
    expect(screen.queryByTestId(`retry-${pendingItem.id}`)).not.toBeInTheDocument();
    expect(screen.queryByTestId(`edit-${pendingItem.id}`)).not.toBeInTheDocument();
  });

  it('shows retry and edit only for failed items', () => {
    renderQueue({ queue: [failedItem] });
    expand();
    expect(screen.getByTestId(`retry-${failedItem.id}`)).toBeInTheDocument();
    expect(screen.getByTestId(`edit-${failedItem.id}`)).toBeInTheDocument();
  });

  it('always shows the discard button regardless of status', () => {
    renderQueue({ queue: [pendingItem, failedItem] });
    expand();
    expect(screen.getByTestId(`discard-${pendingItem.id}`)).toBeInTheDocument();
    expect(screen.getByTestId(`discard-${failedItem.id}`)).toBeInTheDocument();
  });
});

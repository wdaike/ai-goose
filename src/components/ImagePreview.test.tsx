import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { IntlTestWrapper } from '../i18n/test-utils';
import ImagePreview from './ImagePreview';

describe('ImagePreview', () => {
  it('opens the image in a lightbox with download and zoom controls', async () => {
    const user = userEvent.setup();
    render(<ImagePreview src="data:image/png;base64,aW1hZ2UtZGF0YQ==" />, {
      wrapper: IntlTestWrapper,
    });

    await user.click(screen.getByRole('button', { name: 'Click to expand' }));

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Download image' })).toHaveAttribute(
      'download',
      'icodex-image.png'
    );
    expect(screen.getByTestId('image-preview-canvas')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reset zoom to 100%' })).toHaveTextContent('100%');

    await user.click(screen.getByRole('button', { name: 'Zoom in' }));
    expect(screen.getByRole('button', { name: 'Reset zoom to 100%' })).toHaveTextContent('125%');

    await user.click(screen.getByRole('button', { name: 'Reset zoom to 100%' }));
    expect(screen.getByRole('button', { name: 'Reset zoom to 100%' })).toHaveTextContent('100%');

    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });
});

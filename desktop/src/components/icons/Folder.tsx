/**
 * ChatGPT-style folder icons: the closed folder has a distinct left tab that
 * sits a full step above the body's top edge (lucide's Folder keeps both at
 * almost the same height, which reads differently in the sidebar).
 */
export function FolderClosed({ className = '' }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      <path d="M9.086 4.5H5.5a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2h13a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-6.086a1 1 0 0 1-.707-.293L10.293 5.293a1 1 0 0 0-.707-.293Z" />
    </svg>
  );
}

export function FolderOpened({ className = '' }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      <path d="M3.5 17.5v-11a2 2 0 0 1 2-2h3.586a1 1 0 0 1 .707.293l1.414 1.414a1 1 0 0 0 .707.293H17.5a2 2 0 0 1 2 2v1" />
      <path d="M3.5 17.5 5.24 12a2 2 0 0 1 1.9-1.4h13.42a1 1 0 0 1 .96 1.3l-1.6 5.2a2 2 0 0 1-1.9 1.4H5.5a2 2 0 0 1-2-2Z" />
    </svg>
  );
}

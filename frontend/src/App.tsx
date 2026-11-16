import { useEffect } from "react";
import { BrowserRouter, Navigate, Route, Routes, useNavigate } from "react-router-dom";
import { AppShell } from "./components/layout/AppShell";
import { NewReviewPage } from "./pages/NewReviewPage";
import { ReviewPage } from "./pages/ReviewPage";
import { useSessionStore } from "./store/sessionStore";

function RootRedirect() {
  const { summaries, summariesLoaded } = useSessionStore();
  const navigate = useNavigate();
  useEffect(() => {
    if (!summariesLoaded) return;
    navigate(summaries.length ? `/r/${summaries[0].id}` : "/new", { replace: true });
  }, [summariesLoaded]); // eslint-disable-line react-hooks/exhaustive-deps
  return null;
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<AppShell />}>
          <Route index element={<RootRedirect />} />
          <Route path="new" element={<NewReviewPage />} />
          <Route path="r/:sessionId" element={<ReviewPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

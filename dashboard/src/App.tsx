import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { Layout } from '@/components/layout/Layout';
import { WorkflowList } from '@/components/workflow/WorkflowList';
import { WorkflowDetail } from '@/components/workflow/WorkflowDetail';
import { VocRegistrationForm } from '@/components/workflow/VocRegistrationForm';

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<WorkflowList />} />
          <Route path="/voc/new" element={<VocRegistrationForm />} />
          <Route path="/voc/:id" element={<WorkflowDetail />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default App;

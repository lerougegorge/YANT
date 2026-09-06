import { HashRouter, Route, Routes } from 'react-router-dom';
import { ToastProvider } from './components/Toast';
import { SheetProvider } from './components/SheetContext';
import { UpdatePrompt } from './components/UpdatePrompt';
import { useTheme } from './hooks/useTheme';
import { HomeScreen } from './screens/Home';
import { AddScreen } from './screens/Add';
import { NewFoodAiScreen } from './screens/NewFoodAi';
import { QuickAddScreen } from './screens/QuickAdd';
import { NewFoodBarcodeScreen } from './screens/NewFoodBarcode';
import { FoodsScreen } from './screens/Foods';
import { FoodEditScreen } from './screens/FoodEdit';
import { AnalysisScreen } from './screens/Analysis';
import { SettingsScreen } from './screens/Settings';

function AppShell() {
  useTheme();
  return (
    <div className="mx-auto max-w-md min-h-full flex flex-col">
      <UpdatePrompt />
      <Routes>
        <Route path="/" element={<HomeScreen />} />
        <Route path="/add" element={<AddScreen />} />
        <Route path="/add/ai" element={<NewFoodAiScreen />} />
        <Route path="/add/quick" element={<QuickAddScreen />} />
        <Route path="/add/barcode" element={<NewFoodBarcodeScreen />} />
        <Route path="/foods" element={<FoodsScreen />} />
        <Route path="/foods/:id" element={<FoodEditScreen />} />
        <Route path="/analysis" element={<AnalysisScreen />} />
        <Route path="/settings" element={<SettingsScreen />} />
      </Routes>
    </div>
  );
}

export default function App() {
  return (
    <HashRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <ToastProvider>
        <SheetProvider>
          <AppShell />
        </SheetProvider>
      </ToastProvider>
    </HashRouter>
  );
}

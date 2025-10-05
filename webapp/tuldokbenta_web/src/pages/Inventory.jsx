// pages/Inventory.js
import { useEffect, useState } from "react";
import { useInventory } from "../hooks/useInventory";
import Select from "react-select";


const Inventory = () => {
  const {
    inventory,
    isLoading,
    loadInventory,
    createInventoryItem,
    updateInventoryItem,
    deleteInventoryItem,
  } = useInventory();

  const [newItem, setNewItem] = useState({
    item_name: "",
    item_classification: "",
    stock: 0,
    price: 0,
  });

  const uniqueClassifications = [...new Set(inventory.map(i => i.item_classification))];
  const classificationOptions = uniqueClassifications.map(cls => ({
    value: cls,
    label: cls,
  }));
  

  const [editingItem, setEditingItem] = useState(null);
  const [deletingItem, setDeletingItem] = useState(null);

  useEffect(() => {
    loadInventory();
  }, [loadInventory]);

  const handleCreate = async () => {
    if (!newItem.item_name || !newItem.item_classification) return;
    await createInventoryItem(newItem);
    setNewItem({ item_name: "", item_classification: "", stock: 0, price: 0 });
  };

  const handleEditSave = async () => {
    if (!editingItem) return;
    await updateInventoryItem(editingItem.id, editingItem);
    setEditingItem(null);
  };

  const handleDeleteConfirm = async () => {
    if (!deletingItem) return;
    await deleteInventoryItem(deletingItem.id);
    setDeletingItem(null);
  };

  return (
    <div className="max-w-6xl mx-auto mt-10 p-6">
      <h1 className="text-3xl font-bold mb-6">Inventory</h1>

      {/* Add Item Form */}
      <div className="grid grid-cols-5 gap-4 mb-8">
        <div className="flex flex-col">
          <label className="text-sm text-gray-600 mb-1">Item Name</label>
          <input
            type="text"
            value={newItem.item_name}
            onChange={(e) =>
              setNewItem({ ...newItem, item_name: e.target.value })
            }
            className="border rounded-md px-3 py-2 focus:ring-2 focus:ring-blue-400"
          />
        </div>

        <div className="flex flex-col">
          <label className="text-sm text-gray-600 mb-1">Classification</label>
          <Select
            options={classificationOptions}
            value={
              newItem.item_classification
                ? { value: newItem.item_classification, label: newItem.item_classification }
                : null
            }
            onChange={(selected) =>
              setNewItem({ ...newItem, item_classification: selected ? selected.value : "" })
            }
            onInputChange={(inputValue) =>
              setNewItem({ ...newItem, item_classification: inputValue })
            }
            placeholder="Classification"
            isClearable
            isSearchable
            className="react-select-container"
            classNamePrefix="react-select"
          />
        </div>

        <div className="flex flex-col">
          <label className="text-sm text-gray-600 mb-1">Stock</label>
          <input
            type="number"
            value={newItem.stock}
            onChange={(e) =>
              setNewItem({ ...newItem, stock: +e.target.value })
            }
            className="border rounded-md px-3 py-2 focus:ring-2 focus:ring-blue-400"
          />
        </div>

        <div className="flex flex-col">
          <label className="text-sm text-gray-600 mb-1">Price</label>
          <input
            type="number"
            value={newItem.price}
            onChange={(e) =>
              setNewItem({ ...newItem, price: +e.target.value })
            }
            className="border rounded-md px-3 py-2 focus:ring-2 focus:ring-blue-400"
          />
        </div>

        <div className="flex items-end">
          <button
            onClick={handleCreate}
            className="w-full bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700"
          >
            Add Item
          </button>
        </div>
      </div>

      {/* Inventory Table */}
      {isLoading ? (
        <p>Loading...</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse border rounded-lg overflow-hidden shadow-sm">
            <thead>
              <tr className="bg-gray-100 text-left">
                <th className="p-3 border">Name</th>
                <th className="p-3 border">Classification</th>
                <th className="p-3 border">Stock</th>
                <th className="p-3 border">Price</th>
                <th className="p-3 border">Actions</th>
              </tr>
            </thead>
            <tbody>
              {inventory.map((item) => (
                <tr key={item.id} className="hover:bg-gray-50">
                  <td className="p-3 border">{item.item_name}</td>
                  <td className="p-3 border">{item.item_classification}</td>
                  <td className="p-3 border">{item.stock}</td>
                  <td className="p-3 border">${item.price}</td>
                  <td className="p-3 border space-x-2">
                    <button
                      onClick={() => setEditingItem(item)}
                      className="bg-yellow-500 text-white px-3 py-1 rounded hover:bg-yellow-600"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => setDeletingItem(item)} // 🆕 open delete modal
                      className="bg-red-500 text-white px-3 py-1 rounded hover:bg-red-600"
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
              {inventory.length === 0 && (
                <tr>
                  <td colSpan="5" className="text-center p-6 text-gray-500">
                    No items found
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Edit Modal */}
      {editingItem && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl p-6 w-full max-w-md">
            <h2 className="text-xl font-semibold mb-4">Edit Item</h2>
            <div className="space-y-4">
              <div>
                <label className="text-sm text-gray-600">Item Name</label>
                <input
                  type="text"
                  value={editingItem.item_name}
                  onChange={(e) =>
                    setEditingItem({
                      ...editingItem,
                      item_name: e.target.value,
                    })
                  }
                  className="w-full border px-3 py-2 rounded-md focus:ring-2 focus:ring-blue-400"
                />
              </div>
              <div>
                <label className="text-sm text-gray-600">Classification</label>
                <Select
                  options={classificationOptions}
                  value={
                    editingItem?.item_classification
                      ? { value: editingItem.item_classification, label: editingItem.item_classification }
                      : null
                  }
                  onChange={(selected) =>
                    setEditingItem({
                      ...editingItem,
                      item_classification: selected ? selected.value : "",
                    })
                  }
                  onInputChange={(inputValue) =>
                    setEditingItem({ ...editingItem, item_classification: inputValue })
                  }
                  placeholder="Type or select a classification"
                  isClearable
                  isSearchable
                  className="react-select-container"
                  classNamePrefix="react-select"
                />
              </div>
              <div>
                <label className="text-sm text-gray-600">Stock</label>
                <input
                  type="number"
                  value={editingItem.stock}
                  onChange={(e) =>
                    setEditingItem({ ...editingItem, stock: +e.target.value })
                  }
                  className="w-full border px-3 py-2 rounded-md focus:ring-2 focus:ring-blue-400"
                />
              </div>
              <div>
                <label className="text-sm text-gray-600">Price</label>
                <input
                  type="number"
                  value={editingItem.price}
                  onChange={(e) =>
                    setEditingItem({ ...editingItem, price: +e.target.value })
                  }
                  className="w-full border px-3 py-2 rounded-md focus:ring-2 focus:ring-blue-400"
                />
              </div>
            </div>
            <div className="flex justify-end space-x-3 mt-6">
              <button
                onClick={() => setEditingItem(null)}
                className="px-4 py-2 bg-gray-300 rounded-md hover:bg-gray-400"
              >
                Cancel
              </button>
              <button
                onClick={handleEditSave}
                className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}
      {/* 🗑️ Delete Confirmation Modal */}
      {deletingItem && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl p-6 w-full max-w-sm">
            <h2 className="text-xl font-semibold mb-4 text-red-600">Confirm Deletion</h2>
            <p className="mb-6 text-gray-700">
              Are you sure you want to delete{" "}
              <strong>{deletingItem.item_name}</strong>? This action cannot be undone.
            </p>
            <div className="flex justify-end space-x-3">
              <button
                onClick={() => setDeletingItem(null)}
                className="px-4 py-2 bg-gray-300 rounded-md hover:bg-gray-400"
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteConfirm}
                className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Inventory;

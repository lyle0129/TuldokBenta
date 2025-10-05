import { useEffect, useState } from "react";
import { useInventory } from "../hooks/useInventory";

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

  const uniqueClassifications = [
    ...new Set(inventory.map((i) => i.item_classification)),
  ];

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
    <div className="max-w-6xl mx-auto mt-10 p-6 dark:bg-gray-900 transition-colors duration-300">
      <h1 className="text-3xl font-bold mb-6 text-gray-800 dark:text-gray-100">
        Inventory
      </h1>

      {/* Add Item Form */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 mb-8 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4 shadow-sm">
        <div className="flex flex-col">
          <label className="text-sm text-gray-600 dark:text-gray-300 mb-1">
            Item Name
          </label>
          <input
            type="text"
            value={newItem.item_name}
            onChange={(e) =>
              setNewItem({ ...newItem, item_name: e.target.value })
            }
            className="border dark:border-gray-700 bg-gray-50 dark:bg-gray-700 text-gray-800 dark:text-gray-200 rounded-md px-3 py-2 focus:ring-2 focus:ring-blue-400"
          />
        </div>

        <div className="flex flex-col">
          <label className="text-sm text-gray-600 dark:text-gray-300 mb-1">
            Classification
          </label>
          <input
            type="text"
            list="classifications"
            value={newItem.item_classification}
            onChange={(e) =>
              setNewItem({ ...newItem, item_classification: e.target.value })
            }
            className="border dark:border-gray-700 bg-gray-50 dark:bg-gray-700 text-gray-800 dark:text-gray-200 rounded-md px-3 py-2 focus:ring-2 focus:ring-blue-400"
            placeholder="Type or select"
          />
          <datalist id="classifications">
            {uniqueClassifications.map((cls) => (
              <option key={cls} value={cls} />
            ))}
          </datalist>
        </div>

        <div className="flex flex-col">
          <label className="text-sm text-gray-600 dark:text-gray-300 mb-1">
            Stock
          </label>
          <input
            type="number"
            value={newItem.stock}
            onChange={(e) =>
              setNewItem({ ...newItem, stock: +e.target.value })
            }
            className="border dark:border-gray-700 bg-gray-50 dark:bg-gray-700 text-gray-800 dark:text-gray-200 rounded-md px-3 py-2 focus:ring-2 focus:ring-blue-400"
          />
        </div>

        <div className="flex flex-col">
          <label className="text-sm text-gray-600 dark:text-gray-300 mb-1">
            Price (₱)
          </label>
          <input
            type="number"
            value={newItem.price}
            onChange={(e) =>
              setNewItem({ ...newItem, price: +e.target.value })
            }
            className="border dark:border-gray-700 bg-gray-50 dark:bg-gray-700 text-gray-800 dark:text-gray-200 rounded-md px-3 py-2 focus:ring-2 focus:ring-blue-400"
          />
        </div>

        <div className="flex items-end">
          <button
            onClick={handleCreate}
            className="w-full bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 transition"
          >
            Add Item
          </button>
        </div>
      </div>

      {/* Inventory Table */}
      {isLoading ? (
        <p className="text-gray-500 dark:text-gray-400 text-center">Loading...</p>
      ) : (
        <div className="overflow-x-auto rounded-lg shadow-sm border border-gray-200 dark:border-gray-700">
          <table className="w-full text-sm text-left text-gray-700 dark:text-gray-200">
            <thead className="bg-gray-100 dark:bg-gray-800">
              <tr>
                <th className="p-3 border dark:border-gray-700">Name</th>
                <th className="p-3 border dark:border-gray-700">Classification</th>
                <th className="p-3 border dark:border-gray-700">Stock</th>
                <th className="p-3 border dark:border-gray-700">Price (₱)</th>
                <th className="p-3 border dark:border-gray-700">Actions</th>
              </tr>
            </thead>
            <tbody>
              {inventory.map((item) => (
                <tr
                  key={item.id}
                  className="hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                >
                  <td className="p-3 border dark:border-gray-700">
                    {item.item_name}
                  </td>
                  <td className="p-3 border dark:border-gray-700">
                    {item.item_classification}
                  </td>
                  <td className="p-3 border dark:border-gray-700">
                    {item.stock}
                  </td>
                  <td className="p-3 border dark:border-gray-700">
                    ₱{item.price}
                  </td>
                  <td className="p-3 border dark:border-gray-700 space-x-2">
                    <button
                      onClick={() => setEditingItem(item)}
                      className="bg-yellow-500 text-white px-3 py-1 rounded hover:bg-yellow-600 transition"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => setDeletingItem(item)}
                      className="bg-red-500 text-white px-3 py-1 rounded hover:bg-red-600 transition"
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
              {inventory.length === 0 && (
                <tr>
                  <td
                    colSpan="5"
                    className="text-center p-6 text-gray-500 dark:text-gray-400"
                  >
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
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl p-6 w-full max-w-md">
            <h2 className="text-xl font-semibold mb-4 text-gray-800 dark:text-gray-100">
              Edit Item
            </h2>
            <div className="space-y-4">
              <div>
                <label className="text-sm text-gray-600 dark:text-gray-300">
                  Item Name
                </label>
                <input
                  type="text"
                  value={editingItem.item_name}
                  onChange={(e) =>
                    setEditingItem({
                      ...editingItem,
                      item_name: e.target.value,
                    })
                  }
                  className="w-full border dark:border-gray-700 bg-gray-50 dark:bg-gray-700 text-gray-800 dark:text-gray-200 rounded-md px-3 py-2 focus:ring-2 focus:ring-blue-400"
                />
              </div>
              <div>
                <label className="text-sm text-gray-600 dark:text-gray-300">
                  Classification
                </label>
                <input
                  type="text"
                  list="edit-classifications"
                  value={editingItem.item_classification}
                  onChange={(e) =>
                    setEditingItem({
                      ...editingItem,
                      item_classification: e.target.value,
                    })
                  }
                  className="w-full border dark:border-gray-700 bg-gray-50 dark:bg-gray-700 text-gray-800 dark:text-gray-200 rounded-md px-3 py-2 focus:ring-2 focus:ring-blue-400"
                  placeholder="Type or select a classification"
                />
                <datalist id="edit-classifications">
                  {uniqueClassifications.map((cls) => (
                    <option key={cls} value={cls} />
                  ))}
                </datalist>
              </div>
              <div>
                <label className="text-sm text-gray-600 dark:text-gray-300">
                  Stock
                </label>
                <input
                  type="number"
                  value={editingItem.stock}
                  onChange={(e) =>
                    setEditingItem({ ...editingItem, stock: +e.target.value })
                  }
                  className="w-full border dark:border-gray-700 bg-gray-50 dark:bg-gray-700 text-gray-800 dark:text-gray-200 rounded-md px-3 py-2 focus:ring-2 focus:ring-blue-400"
                />
              </div>
              <div>
                <label className="text-sm text-gray-600 dark:text-gray-300">
                  Price (₱)
                </label>
                <input
                  type="number"
                  value={editingItem.price}
                  onChange={(e) =>
                    setEditingItem({ ...editingItem, price: +e.target.value })
                  }
                  className="w-full border dark:border-gray-700 bg-gray-50 dark:bg-gray-700 text-gray-800 dark:text-gray-200 rounded-md px-3 py-2 focus:ring-2 focus:ring-blue-400"
                />
              </div>
            </div>
            <div className="flex justify-end space-x-3 mt-6">
              <button
                onClick={() => setEditingItem(null)}
                className="px-4 py-2 bg-gray-300 dark:bg-gray-700 dark:text-gray-200 rounded-md hover:bg-gray-400 dark:hover:bg-gray-600 transition"
              >
                Cancel
              </button>
              <button
                onClick={handleEditSave}
                className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deletingItem && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl p-6 w-full max-w-sm">
            <h2 className="text-xl font-semibold mb-4 text-red-600 dark:text-red-400">
              Confirm Deletion
            </h2>
            <p className="mb-6 text-gray-700 dark:text-gray-300">
              Are you sure you want to delete{" "}
              <strong>{deletingItem.item_name}</strong>? This action cannot be
              undone.
            </p>
            <div className="flex justify-end space-x-3">
              <button
                onClick={() => setDeletingItem(null)}
                className="px-4 py-2 bg-gray-300 dark:bg-gray-700 dark:text-gray-200 rounded-md hover:bg-gray-400 dark:hover:bg-gray-600 transition"
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteConfirm}
                className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 transition"
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

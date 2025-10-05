// pages/Services.js
import { useEffect, useState } from "react";
import { useServices } from "../hooks/useServices";
import { useInventory } from "../hooks/useInventory";

const Services = () => {
  const {
    services,
    isLoading,
    loadServices,
    createService,
    updateService,
    deleteService,
  } = useServices();

  const { inventory, loadInventory } = useInventory();

  const [newService, setNewService] = useState({
    service_name: "",
    price: 0,
    freebies: [],
  });

  const [editingService, setEditingService] = useState(null);

  useEffect(() => {
    loadServices();
    loadInventory();
  }, [loadServices, loadInventory]);

  const handleCreate = async () => {
    if (!newService.service_name) return;
    await createService(newService);
    setNewService({ service_name: "", price: 0, freebies: [] });
  };

  const handleEditSave = async () => {
    if (!editingService) return;
    await updateService(editingService.id, editingService);
    setEditingService(null);
  };

  const classifications = [
    ...new Set(inventory.map((item) => item.item_classification)),
  ];

  const toggleFreebie = (serviceObj, classification) => {
    const alreadySelected = serviceObj.freebies.includes(classification);
    const updated = alreadySelected
      ? serviceObj.freebies.filter((c) => c !== classification)
      : [...serviceObj.freebies, classification];
    return { ...serviceObj, freebies: updated };
  };

  return (
    <div className="max-w-6xl mx-auto mt-10 p-4 sm:p-6">
      <h1 className="text-3xl font-bold mb-6 text-gray-800 dark:text-gray-100">
        Services
      </h1>

      {/* Add Service Section */}
      <div className="bg-white dark:bg-gray-800 shadow rounded-xl p-6 mb-8 transition">
        <h2 className="text-lg font-semibold mb-4 text-gray-800 dark:text-gray-100">
          Add New Service
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
          <div>
            <label className="block text-sm font-medium mb-1 text-gray-600 dark:text-gray-300">
              Service Name
            </label>
            <input
              type="text"
              placeholder="Service Name"
              value={newService.service_name}
              onChange={(e) =>
                setNewService({ ...newService, service_name: e.target.value })
              }
              className="w-full border border-gray-300 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100 rounded-md px-3 py-2 focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1 text-gray-600 dark:text-gray-300">
              Price
            </label>
            <input
              type="number"
              placeholder="₱0.00"
              value={newService.price}
              onChange={(e) =>
                setNewService({ ...newService, price: +e.target.value })
              }
              className="w-full border border-gray-300 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100 rounded-md px-3 py-2 focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium mb-2 text-gray-600 dark:text-gray-300">
            Freebies Included
          </label>
          <div className="flex flex-wrap gap-3">
            {classifications.map((cls) => (
              <label
                key={cls}
                className="flex items-center space-x-2 text-sm bg-gray-100 dark:bg-gray-700 px-3 py-1 rounded-md cursor-pointer"
              >
                <input
                  type="checkbox"
                  checked={newService.freebies.includes(cls)}
                  onChange={() => setNewService(toggleFreebie(newService, cls))}
                  className="accent-blue-600"
                />
                <span className="dark:text-gray-100">{cls}</span>
              </label>
            ))}
          </div>
        </div>

        <button
          onClick={handleCreate}
          className="mt-6 bg-blue-600 text-white px-6 py-2 rounded-md hover:bg-blue-700 transition w-full sm:w-auto"
        >
          Add Service
        </button>
      </div>

      {/* Services Table */}
      {isLoading ? (
        <p className="text-gray-600 dark:text-gray-300">Loading...</p>
      ) : (
        <div className="overflow-x-auto bg-white dark:bg-gray-800 rounded-xl shadow">
          <table className="w-full border-collapse text-sm">
            <thead className="bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200">
              <tr>
                <th className="p-3 border dark:border-gray-600">Name</th>
                <th className="p-3 border dark:border-gray-600">Price</th>
                <th className="p-3 border dark:border-gray-600">Freebies</th>
                <th className="p-3 border dark:border-gray-600 text-center">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {services.map((service, idx) => (
                <tr
                  key={service.id}
                  className={`${
                    idx % 2 === 0
                      ? "bg-white dark:bg-gray-800"
                      : "bg-gray-50 dark:bg-gray-900"
                  } hover:bg-gray-100 dark:hover:bg-gray-700 transition`}
                >
                  <td className="p-3 border dark:border-gray-700 text-gray-800 dark:text-gray-100">
                    {service.service_name}
                  </td>
                  <td className="p-3 border dark:border-gray-700 text-gray-800 dark:text-gray-100">
                    ₱{service.price}
                  </td>
                  <td className="p-3 border dark:border-gray-700 text-gray-700 dark:text-gray-200">
                    {service.freebies?.length > 0
                      ? service.freebies.join(", ")
                      : "-"}
                  </td>
                  <td className="p-3 border dark:border-gray-700 text-center space-x-2">
                    <button
                      onClick={() => setEditingService(service)}
                      className="bg-yellow-500 text-white px-3 py-1 rounded-md hover:bg-yellow-600"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => deleteService(service.id)}
                      className="bg-red-500 text-white px-3 py-1 rounded-md hover:bg-red-600"
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
              {services.length === 0 && (
                <tr>
                  <td
                    colSpan="4"
                    className="text-center p-6 text-gray-500 dark:text-gray-400 italic"
                  >
                    No services found
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Edit Modal */}
      {editingService && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl p-6 w-full max-w-md">
            <h2 className="text-xl font-semibold mb-4 text-gray-800 dark:text-gray-100">
              Edit Service
            </h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1 text-gray-600 dark:text-gray-300">
                  Service Name
                </label>
                <input
                  type="text"
                  value={editingService.service_name}
                  onChange={(e) =>
                    setEditingService({
                      ...editingService,
                      service_name: e.target.value,
                    })
                  }
                  className="w-full border dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100 px-3 py-2 rounded-md focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1 text-gray-600 dark:text-gray-300">
                  Price
                </label>
                <input
                  type="number"
                  value={editingService.price}
                  onChange={(e) =>
                    setEditingService({
                      ...editingService,
                      price: +e.target.value,
                    })
                  }
                  className="w-full border dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100 px-3 py-2 rounded-md focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-2 text-gray-600 dark:text-gray-300">
                  Freebies Included
                </label>
                <div className="flex flex-wrap gap-3">
                  {classifications.map((cls) => (
                    <label
                      key={cls}
                      className="flex items-center space-x-2 text-sm bg-gray-100 dark:bg-gray-700 px-3 py-1 rounded-md"
                    >
                      <input
                        type="checkbox"
                        checked={editingService.freebies?.includes(cls)}
                        onChange={() =>
                          setEditingService(toggleFreebie(editingService, cls))
                        }
                        className="accent-blue-600"
                      />
                      <span className="dark:text-gray-100">{cls}</span>
                    </label>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex justify-end space-x-3 mt-6">
              <button
                onClick={() => setEditingService(null)}
                className="px-5 py-2 bg-gray-300 dark:bg-gray-600 text-gray-800 dark:text-gray-100 rounded-md hover:bg-gray-400 dark:hover:bg-gray-500"
              >
                Cancel
              </button>
              <button
                onClick={handleEditSave}
                className="px-5 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Services;

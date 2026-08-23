import * as React from "react";
const DealList = React.lazy(() => import("./DealList"));
// The deal page is a route now, not a dialog mounted by the list: the 25 %
// side column and the imposed vertical order do not fit in a modal.
const DealShowPage = React.lazy(() => import("./show/DealShowPage"));

export default {
  list: DealList,
  show: DealShowPage,
};
